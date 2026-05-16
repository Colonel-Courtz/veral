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

function classifyHttpError(status: number, url: string): GithubFetchError {
  if (status === 403 || status === 429) {
    return new GithubFetchError(
      'rate_limited',
      `github: rate limited (HTTP ${status}) for ${url}`,
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
  if (response.status < 200 || response.status >= 300)
    throw classifyHttpError(response.status, url);

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

function parseRepoListItem(raw: unknown): RawRepo | null {
  const obj = asObject(raw);
  if (obj === null) return null;
  const name = asString(obj.name);
  const fullName = asString(obj.full_name);
  if (name === null || fullName === null) return null;
  return {
    name,
    fullName,
    pushedAt: asString(obj.pushed_at),
    stars: asInteger(obj.stargazers_count) ?? 0,
  };
}

function parseRepoList(raw: unknown): ReadonlyArray<RawRepo> | null {
  if (!Array.isArray(raw)) return null;
  const out: RawRepo[] = [];
  for (const item of raw) {
    const parsed = parseRepoListItem(item);
    if (parsed !== null) out.push(parsed);
  }
  return out;
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

async function fetchTopRepos(
  ctx: ClientContext,
  owner: string,
  cap: number,
): Promise<ReadonlyArray<RawRepo>> {
  // GitHub's /users/{owner}/repos accepts sort=updated|created|pushed|full_name;
  // it does NOT support sort=stars. We page once at the cap and sort
  // client-side by stargazers — for the P0 budget we accept the implicit
  // "first page of updated repos" pre-filter; v2 can widen pages if the
  // budget is raised.
  const url = `${ctx.baseUrl}/users/${encodeURIComponent(owner)}/repos?per_page=${cap}&sort=updated`;
  const result = await probe(ctx, url, parseRepoList);
  if (result.kind !== 'ok') return [];
  const sorted = [...result.value].sort((a, b) => b.stars - a.stars);
  return sorted.slice(0, cap);
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
//   1 (user) + 1 (top-repo list) + 20 repos × (4 test probes + 1 README + 1 LICENSE) = 122.
// Documented so future increases (adding endpoints) stay below GitHub's
// 5000/h authed-rate-limit ceiling assuming ~40 subjects per hour per
// token. P1 endpoints (issues/releases/actions) are tracked separately.
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
  const rawRepos = await fetchTopRepos(ctx, owner, cap);
  if (ctx.externalSignal?.aborted) {
    throw new GithubFetchError('network_error', 'github: aborted after repo list fetch');
  }
  const repos = await Promise.all(rawRepos.map((raw) => enrichRepo(ctx, raw, thresholdBytes)));

  return { user, repos, callBudget: ctx.callBudget.count };
}
