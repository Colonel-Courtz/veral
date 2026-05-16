import { mergeAbortSignals } from '@veral/shared';

import type { GithubRepo, GithubUser } from './schema';

export const DEFAULT_GITHUB_BASE_URL = 'https://api.github.com';
export const DEFAULT_GITHUB_TIMEOUT_MS = 15_000;
export const GITHUB_API_VERSION = '2022-11-28';

export const DEFAULT_TOP_REPO_CAP = 20;
export const DEFAULT_README_BYTES_THRESHOLD = 200;
export const TEST_DIR_CANDIDATES: ReadonlyArray<string> = ['test', 'tests', '__tests__', 'spec'];

export type GithubFetchErrorReason =
  | 'missing_token'
  | 'network_error'
  | 'malformed_response'
  | 'rate_limited'
  | 'unauthorized'
  | 'not_found'
  | 'server_error';

export class GithubFetchError extends Error {
  readonly reason: GithubFetchErrorReason;
  readonly httpStatus: number | undefined;
  constructor(reason: GithubFetchErrorReason, message: string, httpStatus?: number) {
    super(message);
    this.name = 'GithubFetchError';
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

export type GithubFetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export interface GithubClientOptions {
  readonly token: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: GithubFetchImpl;
  readonly timeoutMs?: number;
  readonly topRepoCap?: number;
  readonly readmeBytesThreshold?: number;
  // Orchestrator-supplied cancellation. Threaded into every probe
  // call and checked between sequential repo enrichments so an
  // upstream timeout stops firing new HTTP requests promptly.
  readonly signal?: AbortSignal;
}

interface ClientContext {
  readonly fetchImpl: GithubFetchImpl;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly headers: Record<string, string>;
  readonly externalSignal: AbortSignal | undefined;
  // The agent surfaces total HTTP calls in findings for cost observability.
  callBudget: { count: number };
}

function buildContext(options: GithubClientOptions): ClientContext {
  return {
    fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
    baseUrl: options.baseUrl ?? DEFAULT_GITHUB_BASE_URL,
    timeoutMs: options.timeoutMs ?? DEFAULT_GITHUB_TIMEOUT_MS,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${options.token}`,
      'x-github-api-version': GITHUB_API_VERSION,
      'user-agent': 'veral-agent/1.0',
    },
    externalSignal: options.signal,
    callBudget: { count: 0 },
  };
}

// GitHub overloads 403 for both quota exhaustion and authentication
// failure (revoked token, missing scope). Operators need to know which
// happened: rate-limit clears on its own, auth needs a new token. The
// official rate-limit signal is X-RateLimit-Remaining: 0; auth failures
// surface in the JSON body's `message` field as "Bad credentials" or
// "Resource not accessible by integration".
async function classifyHttpError(response: Response, url: string): Promise<GithubFetchError> {
  const status = response.status;
  if (status === 429) {
    return new GithubFetchError(
      'rate_limited',
      `github: rate limited (HTTP ${status}) for ${url}`,
      status,
    );
  }
  if (status === 403) {
    if (response.headers.get('x-ratelimit-remaining') === '0') {
      return new GithubFetchError(
        'rate_limited',
        `github: rate limited (HTTP 403, remaining=0) for ${url}`,
        status,
      );
    }
    let body = '';
    try {
      body = await response.text();
    } catch {
      // Body unreadable — fall through to conservative rate_limited default.
    }
    if (/bad credentials|resource not accessible/i.test(body)) {
      return new GithubFetchError(
        'unauthorized',
        `github: unauthorized (HTTP 403) for ${url}`,
        status,
      );
    }
    return new GithubFetchError(
      'rate_limited',
      `github: rate limited (HTTP 403) for ${url}`,
      status,
    );
  }
  if (status >= 500) {
    return new GithubFetchError(
      'server_error',
      `github: server error (HTTP ${status}) for ${url}`,
      status,
    );
  }
  return new GithubFetchError(
    'server_error',
    `github: unexpected HTTP ${status} for ${url}`,
    status,
  );
}

type ProbeResult<T> = { readonly kind: 'ok'; readonly value: T } | { readonly kind: 'absent' };

async function probe<T>(
  ctx: ClientContext,
  url: string,
  parse: (raw: unknown) => T | null,
): Promise<ProbeResult<T>> {
  ctx.callBudget.count += 1;
  if (ctx.externalSignal?.aborted) {
    throw new GithubFetchError('network_error', `github: aborted before request to ${url}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  const signal = mergeAbortSignals(controller.signal, ctx.externalSignal);
  let response: Response;
  try {
    response = await ctx.fetchImpl(url, {
      method: 'GET',
      headers: ctx.headers,
      signal,
    });
  } catch (err) {
    throw new GithubFetchError(
      'network_error',
      `github: network error for ${url} — ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) return { kind: 'absent' };
  if (response.status < 200 || response.status >= 300) throw await classifyHttpError(response, url);

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new GithubFetchError(
      'malformed_response',
      `github: invalid JSON for ${url} — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const parsed = parse(body);
  if (parsed === null) {
    throw new GithubFetchError('malformed_response', `github: schema mismatch for ${url}`);
  }
  return { kind: 'ok', value: parsed };
}

function asObject(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function asString(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function asInteger(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && Number.isInteger(raw) ? raw : null;
}

function parseUser(raw: unknown): GithubUser | null {
  const obj = asObject(raw);
  if (obj === null) return null;
  const login = asString(obj.login);
  if (login === null) return null;
  return {
    login,
    createdAt: asString(obj.created_at),
    publicRepos: asInteger(obj.public_repos) ?? 0,
  };
}

interface RawRepo {
  readonly name: string;
  readonly fullName: string;
  readonly pushedAt: string | null;
  readonly stars: number;
}

// Returns dir (array body) or file (object with type: 'file' + size) or null.
function parseContents(
  raw: unknown,
): { readonly kind: 'dir' } | { readonly kind: 'file'; readonly size: number } | null {
  if (Array.isArray(raw)) return { kind: 'dir' };
  const obj = asObject(raw);
  if (obj === null) return null;
  if (obj.type !== 'file') return null;
  const size = asInteger(obj.size);
  if (size === null) return null;
  return { kind: 'file', size };
}

async function fetchUser(ctx: ClientContext, owner: string): Promise<GithubUser | null> {
  const url = `${ctx.baseUrl}/users/${encodeURIComponent(owner)}`;
  const result = await probe(ctx, url, parseUser);
  return result.kind === 'ok' ? result.value : null;
}

// GitHub's REST /users/{owner}/repos endpoint does not accept sort=stars
// — only updated|created|pushed|full_name. A client-side re-sort after
// sort=updated only re-orders the recently-touched window, biasing the
// agent toward active maintenance over historical popularity. GraphQL's
// repositories(orderBy: STARGAZERS DESC) is the only path that returns
// true top-N-by-stars in a single call.
const REPO_DISCOVERY_QUERY = `query VeralRepoDiscovery($login: String!, $first: Int!) {
  user(login: $login) {
    repositories(first: $first, orderBy: {field: STARGAZERS, direction: DESC}, isFork: false, ownerAffiliations: OWNER) {
      nodes {
        name
        nameWithOwner
        stargazerCount
        pushedAt
      }
    }
  }
}`;

function parseGraphqlRepoNode(raw: unknown): RawRepo | null {
  const obj = asObject(raw);
  if (obj === null) return null;
  const name = asString(obj.name);
  const fullName = asString(obj.nameWithOwner);
  if (name === null || fullName === null) return null;
  return {
    name,
    fullName,
    pushedAt: asString(obj.pushedAt),
    stars: asInteger(obj.stargazerCount) ?? 0,
  };
}

function parseGraphqlReposResponse(raw: unknown): ReadonlyArray<RawRepo> {
  const obj = asObject(raw);
  if (obj === null) {
    throw new GithubFetchError('malformed_response', 'github graphql: non-object response');
  }
  const errors = obj.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = asObject(errors[0]);
    const msg = (first && asString(first.message)) ?? 'unknown error';
    throw new GithubFetchError('malformed_response', `github graphql: ${msg}`);
  }
  const data = asObject(obj.data);
  if (data === null) return [];
  // data.user is null when the login is unknown — caller already maps
  // that to status='partial' via the separate REST user fetch, so we
  // return an empty repo list rather than throwing.
  const userObj = asObject(data.user);
  if (userObj === null) return [];
  const repositories = asObject(userObj.repositories);
  if (repositories === null) return [];
  const nodes = repositories.nodes;
  if (!Array.isArray(nodes)) return [];
  const out: RawRepo[] = [];
  for (const node of nodes) {
    const parsed = parseGraphqlRepoNode(node);
    if (parsed !== null) out.push(parsed);
  }
  return out;
}

async function fetchTopReposViaGraphQL(
  ctx: ClientContext,
  owner: string,
  cap: number,
): Promise<ReadonlyArray<RawRepo>> {
  ctx.callBudget.count += 1;
  const url = `${ctx.baseUrl}/graphql`;
  if (ctx.externalSignal?.aborted) {
    throw new GithubFetchError('network_error', `github: aborted before request to ${url}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  const signal = mergeAbortSignals(controller.signal, ctx.externalSignal);
  let response: Response;
  try {
    response = await ctx.fetchImpl(url, {
      method: 'POST',
      headers: { ...ctx.headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        query: REPO_DISCOVERY_QUERY,
        variables: { login: owner, first: cap },
      }),
      signal,
    });
  } catch (err) {
    throw new GithubFetchError(
      'network_error',
      `github: network error for ${url} — ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (response.status < 200 || response.status >= 300) {
    throw await classifyHttpError(response, url);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new GithubFetchError(
      'malformed_response',
      `github graphql: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return parseGraphqlReposResponse(body);
}

async function probeTestDir(ctx: ClientContext, fullName: string): Promise<boolean> {
  // Four parallel contents probes, one per candidate dir. An array body
  // means the path exists as a directory. Anything else (file, 404, or
  // throw) falls through to "no test dir".
  const probes = await Promise.all(
    TEST_DIR_CANDIDATES.map((dir) =>
      probe(ctx, `${ctx.baseUrl}/repos/${fullName}/contents/${dir}`, parseContents).catch(() => ({
        kind: 'absent' as const,
      })),
    ),
  );
  return probes.some((p) => p.kind === 'ok' && p.value.kind === 'dir');
}

async function probeReadme(
  ctx: ClientContext,
  fullName: string,
  thresholdBytes: number,
): Promise<boolean> {
  const result = await probe(
    ctx,
    `${ctx.baseUrl}/repos/${fullName}/contents/README.md`,
    parseContents,
  ).catch(() => ({ kind: 'absent' as const }));
  if (result.kind !== 'ok' || result.value.kind !== 'file') return false;
  return result.value.size > thresholdBytes;
}

async function probeLicense(ctx: ClientContext, fullName: string): Promise<boolean> {
  // GitHub exposes a license endpoint that returns 404 when no LICENSE
  // file is detected; that is simpler than a /contents probe because it
  // also recognises LICENSE.md and LICENSE.txt variants.
  const result = await probe(ctx, `${ctx.baseUrl}/repos/${fullName}/license`, (raw) =>
    asObject(raw) === null ? null : { ok: true as const },
  ).catch(() => ({ kind: 'absent' as const }));
  return result.kind === 'ok';
}

async function enrichRepo(
  ctx: ClientContext,
  raw: RawRepo,
  thresholdBytes: number,
): Promise<GithubRepo> {
  const [hasTestDir, hasSubstantialReadme, hasLicense] = await Promise.all([
    probeTestDir(ctx, raw.fullName),
    probeReadme(ctx, raw.fullName, thresholdBytes),
    probeLicense(ctx, raw.fullName),
  ]);
  return {
    name: raw.name,
    fullName: raw.fullName,
    pushedAt: raw.pushedAt,
    stars: raw.stars,
    hasTestDir,
    hasSubstantialReadme,
    hasLicense,
  };
}

export interface GithubFetchResult {
  readonly user: GithubUser | null;
  readonly repos: ReadonlyArray<GithubRepo>;
  readonly callBudget: number;
}

// Call budget per subject:
//   1 (user) + 1 (graphql top-repo list) + 20 repos × (4 test probes + 1 README + 1 LICENSE) = 122.
// GraphQL replaces the REST /users/{owner}/repos call; per-repo
// hygiene probes stay on REST because they have no GraphQL equivalent.
// Stays well below GitHub's 5000/h authed-rate-limit assuming ~40
// subjects per hour per token.
export async function fetchGithubP0(
  owner: string,
  options: GithubClientOptions,
): Promise<GithubFetchResult> {
  if (!options.token || options.token.length === 0) {
    throw new GithubFetchError('missing_token', 'github: GITHUB_TOKEN is required');
  }
  const ctx = buildContext(options);
  const cap = options.topRepoCap ?? DEFAULT_TOP_REPO_CAP;
  const thresholdBytes = options.readmeBytesThreshold ?? DEFAULT_README_BYTES_THRESHOLD;

  const user = await fetchUser(ctx, owner);
  if (ctx.externalSignal?.aborted) {
    throw new GithubFetchError('network_error', 'github: aborted after user fetch');
  }
  const rawRepos = await fetchTopReposViaGraphQL(ctx, owner, cap);
  if (ctx.externalSignal?.aborted) {
    throw new GithubFetchError('network_error', 'github: aborted after repo list fetch');
  }
  const repos = await Promise.all(rawRepos.map((raw) => enrichRepo(ctx, raw, thresholdBytes)));

  return { user, repos, callBudget: ctx.callBudget.count };
}
