import { mergeAbortSignals } from '@veral/shared';

import type { EtherscanContractFinding } from './schema';

export const DEFAULT_ETHERSCAN_BASE_URL = 'https://api.etherscan.io';
export const DEFAULT_ETHERSCAN_TIMEOUT_MS = 10_000;

export type EtherscanFetchErrorReason =
  | 'missing_api_key'
  | 'network_error'
  | 'malformed_response'
  | 'rate_limited'
  | 'unauthorized'
  | 'server_error'
  | 'api_error';

export class EtherscanFetchError extends Error {
  readonly reason: EtherscanFetchErrorReason;
  readonly httpStatus: number | undefined;
  constructor(reason: EtherscanFetchErrorReason, message: string, httpStatus?: number) {
    super(message);
    this.name = 'EtherscanFetchError';
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

export type EtherscanFetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export interface EtherscanClientOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: EtherscanFetchImpl;
  readonly timeoutMs?: number;
  // Orchestrator-supplied cancellation. Merged with the per-request
  // timeout AbortController so either deadline aborts the underlying
  // fetch.
  readonly signal?: AbortSignal;
}

function buildSourceCodeUrl(
  baseUrl: string,
  chainId: number,
  address: `0x${string}`,
  apiKey: string,
): string {
  // Etherscan v2 unified endpoint — chainid query parameter routes the
  // request to the correct chain's index. Avoids hardcoding per-chain
  // host names (api.etherscan.io vs api-sepolia.etherscan.io vs ...).
  const noTrail = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const params = new URLSearchParams({
    chainid: String(chainId),
    module: 'contract',
    action: 'getsourcecode',
    address: address.toLowerCase(),
    apikey: apiKey,
  });
  return `${noTrail}/api?${params.toString()}`;
}

function asObject(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function asString(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

interface EtherscanResultEntry {
  readonly sourceCode: string;
  readonly contractName: string | null;
  readonly compilerVersion: string | null;
  readonly hasProxy: boolean;
}

function parseResultEntry(raw: unknown): EtherscanResultEntry | null {
  const obj = asObject(raw);
  if (obj === null) return null;
  // SourceCode comes back as a (possibly empty) string. Empty means
  // "not verified" — the entry is still returned by the API.
  const sourceCode = typeof obj.SourceCode === 'string' ? obj.SourceCode : '';
  return {
    sourceCode,
    contractName: asString(obj.ContractName),
    compilerVersion: asString(obj.CompilerVersion),
    hasProxy: obj.Proxy === '1',
  };
}

function unverifiedFinding(chainId: number, address: `0x${string}`): EtherscanContractFinding {
  return {
    chainId,
    address: address.toLowerCase() as `0x${string}`,
    etherscanVerified: false,
    compilerVersion: null,
    contractName: null,
    hasProxy: false,
  };
}

function classifyApiError(status: string, message: string): EtherscanFetchError {
  // Etherscan returns 200 + status='0' for several scenarios. We have
  // to read `message` (or the result string in some shapes) to tell
  // them apart. Unverified contracts ALSO come back as status='0' in
  // a few legacy responses — the caller must check SourceCode before
  // treating status='0' as a fatal error.
  const lower = `${message}`.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('max rate limit')) {
    return new EtherscanFetchError('rate_limited', `etherscan: ${message}`);
  }
  if (lower.includes('invalid api key') || lower.includes('missing api key')) {
    return new EtherscanFetchError('unauthorized', `etherscan: ${message}`);
  }
  return new EtherscanFetchError('api_error', `etherscan: ${status}/${message}`);
}

function classifyHttp(status: number): EtherscanFetchError | null {
  if (status === 429) {
    return new EtherscanFetchError('rate_limited', `etherscan: rate limited (HTTP 429)`, 429);
  }
  if (status === 401 || status === 403) {
    return new EtherscanFetchError(
      'unauthorized',
      `etherscan: unauthorized (HTTP ${status})`,
      status,
    );
  }
  if (status >= 500) {
    return new EtherscanFetchError(
      'server_error',
      `etherscan: server error (HTTP ${status})`,
      status,
    );
  }
  if (status < 200 || status >= 300) {
    return new EtherscanFetchError('server_error', `etherscan: unexpected HTTP ${status}`, status);
  }
  return null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (err) {
    throw new EtherscanFetchError(
      'malformed_response',
      `etherscan: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function extractResultEntry(body: unknown): EtherscanResultEntry | 'api_error' {
  const root = asObject(body);
  if (root === null) {
    throw new EtherscanFetchError('malformed_response', 'etherscan: response is not an object');
  }
  const status = typeof root.status === 'string' ? root.status : '';
  const message = typeof root.message === 'string' ? root.message : '';
  const result = root.result;
  // Hard-error shape: status='0' AND result is a string (e.g. "Invalid
  // API Key", "Max rate limit reached"). The result array shape is
  // returned for both verified and unverified contracts.
  if (status === '0' && typeof result === 'string') {
    throw classifyApiError(status, result || message);
  }
  if (!Array.isArray(result) || result.length === 0) {
    return 'api_error';
  }
  const parsed = parseResultEntry(result[0]);
  if (parsed === null) {
    throw new EtherscanFetchError('malformed_response', 'etherscan: result entry is not an object');
  }
  return parsed;
}

export async function fetchEtherscanContract(
  chainId: number,
  address: `0x${string}`,
  options: EtherscanClientOptions,
): Promise<EtherscanContractFinding> {
  if (!options.apiKey || options.apiKey.length === 0) {
    throw new EtherscanFetchError('missing_api_key', 'etherscan: ETHERSCAN_API_KEY is required');
  }
  const baseUrl = options.baseUrl ?? DEFAULT_ETHERSCAN_BASE_URL;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_ETHERSCAN_TIMEOUT_MS;
  const url = buildSourceCodeUrl(baseUrl, chainId, address, options.apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = mergeAbortSignals(controller.signal, options.signal);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal,
    });
  } catch (err) {
    throw new EtherscanFetchError(
      'network_error',
      `etherscan: network error — ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const httpErr = classifyHttp(response.status);
  if (httpErr) throw httpErr;

  const body = await readJson(response);
  const extracted = extractResultEntry(body);
  if (extracted === 'api_error') {
    throw new EtherscanFetchError('api_error', 'etherscan: empty result array');
  }
  if (extracted.sourceCode.length === 0) {
    return unverifiedFinding(chainId, address);
  }
  return {
    chainId,
    address: address.toLowerCase() as `0x${string}`,
    etherscanVerified: true,
    compilerVersion: extracted.compilerVersion,
    contractName: extracted.contractName,
    hasProxy: extracted.hasProxy,
  };
}
