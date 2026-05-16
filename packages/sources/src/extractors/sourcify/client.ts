import { mergeAbortSignals } from '@veral/shared';

import type { SourcifyContractFinding, SourcifyMatchLevel } from './schema';

export const DEFAULT_SOURCIFY_BASE_URL = 'https://sourcify.dev/server';
export const DEFAULT_SOURCIFY_TIMEOUT_MS = 10_000;

export type SourcifyFetchErrorReason =
  | 'network_error'
  | 'malformed_response'
  | 'rate_limited'
  | 'server_error';

export class SourcifyFetchError extends Error {
  readonly reason: SourcifyFetchErrorReason;
  readonly httpStatus: number | undefined;
  constructor(reason: SourcifyFetchErrorReason, message: string, httpStatus?: number) {
    super(message);
    this.name = 'SourcifyFetchError';
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface SourcifyClientOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly timeoutMs?: number;
  // Orchestrator-supplied cancellation. Merged with the per-request
  // timeout AbortController so either deadline aborts the underlying
  // fetch and releases the socket.
  readonly signal?: AbortSignal;
}

// Env may carry the root (`https://sourcify.dev/server`) or include /v2 already.
// Normalize so we control the version segment in one place — version drift here
// flips a verified contract to "unknown" silently across the score formula.
function buildContractUrl(baseUrl: string, chainId: number, address: string): string {
  const noTrail = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const root = noTrail.endsWith('/v2') ? noTrail : `${noTrail}/v2`;
  const fields = 'runtimeMatch,creationMatch,compilation';
  return `${root}/contract/${chainId}/${address}?fields=${fields}`;
}

function parseMatchLevel(raw: unknown): SourcifyMatchLevel | null {
  if (raw === 'exact_match' || raw === 'match') return raw;
  if (raw === null || raw === undefined) return 'not_found';
  return null;
}

function asObject(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function asString(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function parseCompilation(raw: unknown): {
  compilerVersion: string | null;
  language: string | null;
  contractName: string | null;
} {
  const obj = asObject(raw);
  if (!obj) return { compilerVersion: null, language: null, contractName: null };
  return {
    compilerVersion: asString(obj.compilerVersion) ?? asString(obj.version),
    language: asString(obj.language),
    contractName: asString(obj.name) ?? asString(obj.contractName),
  };
}

function notFoundFinding(chainId: number, address: string): SourcifyContractFinding {
  return {
    chainId,
    address: address.toLowerCase() as `0x${string}`,
    match: 'not_found',
    compilerVersion: null,
    language: null,
    contractName: null,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (err) {
    throw new SourcifyFetchError(
      'malformed_response',
      `sourcify: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function classifyStatus(status: number): SourcifyFetchError | null {
  if (status === 429) {
    return new SourcifyFetchError('rate_limited', 'sourcify: rate limited (HTTP 429)', 429);
  }
  if (status >= 500) {
    return new SourcifyFetchError(
      'server_error',
      `sourcify: server error (HTTP ${status})`,
      status,
    );
  }
  if (status < 200 || status >= 300) {
    return new SourcifyFetchError('server_error', `sourcify: unexpected HTTP ${status}`, status);
  }
  return null;
}

export async function fetchSourcifyContract(
  chainId: number,
  address: `0x${string}`,
  options: SourcifyClientOptions = {},
): Promise<SourcifyContractFinding> {
  const baseUrl = options.baseUrl ?? DEFAULT_SOURCIFY_BASE_URL;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_SOURCIFY_TIMEOUT_MS;
  const url = buildContractUrl(baseUrl, chainId, address);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = mergeAbortSignals(controller.signal, options.signal);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal,
    });
  } catch (err) {
    throw new SourcifyFetchError(
      'network_error',
      `sourcify: network error — ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) return notFoundFinding(chainId, address);

  const httpErr = classifyStatus(response.status);
  if (httpErr) throw httpErr;

  const body = await readJson(response);
  const obj = asObject(body);
  if (!obj) {
    throw new SourcifyFetchError('malformed_response', 'sourcify: response is not an object');
  }
  const match = parseMatchLevel(obj.match ?? obj.runtimeMatch);
  if (match === null) {
    throw new SourcifyFetchError(
      'malformed_response',
      `sourcify: unknown match value ${JSON.stringify(obj.match ?? obj.runtimeMatch)}`,
    );
  }
  const compilation = parseCompilation(obj.compilation);
  return {
    chainId,
    address: address.toLowerCase() as `0x${string}`,
    match,
    compilerVersion: compilation.compilerVersion,
    language: compilation.language,
    contractName: compilation.contractName,
  };
}
