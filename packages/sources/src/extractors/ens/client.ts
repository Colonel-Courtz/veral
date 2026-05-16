import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

export const ENS_REGISTRY_ADDRESS = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const;
export const DEFAULT_ENS_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/ensdomains/ens';
export const DEFAULT_ENS_TIMEOUT_MS = 10_000;
// 25-event head window per resolver — the prior hackathon agent showed
// that a long stream of non-TextChanged events can push the most recent
// TextChanged off the first page. Tight enough that the GraphQL payload
// stays small.
export const ENS_EVENTS_HEAD_WINDOW = 25;

export type EnsFetchErrorReason = 'missing_rpc_url' | 'rpc_error' | 'subgraph_error';

export class EnsFetchError extends Error {
  readonly reason: EnsFetchErrorReason;
  constructor(reason: EnsFetchErrorReason, message: string) {
    super(message);
    this.name = 'EnsFetchError';
    this.reason = reason;
  }
}

export type EnsFetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

// Narrow RPC interface. Production wiring builds it from a viem
// PublicClient; tests pass an in-memory stub.
export interface EnsRpcClient {
  resolverAddress(namehash: `0x${string}`): Promise<`0x${string}` | null>;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

const ENS_REGISTRY_RESOLVER_ABI = [
  {
    type: 'function',
    name: 'resolver',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

function viemRpcClient(rpcUrl: string, timeoutMs: number): EnsRpcClient {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl, { timeout: timeoutMs }),
  });
  return {
    async resolverAddress(namehash) {
      const result = (await client.readContract({
        address: ENS_REGISTRY_ADDRESS,
        abi: ENS_REGISTRY_RESOLVER_ABI,
        functionName: 'resolver',
        args: [namehash],
      })) as `0x${string}`;
      const lower = result.toLowerCase() as `0x${string}`;
      return lower === ZERO_ADDRESS ? null : lower;
    },
  };
}

export interface EnsRpcOptions {
  readonly mainnetRpcUrl?: string;
  readonly rpcClient?: EnsRpcClient;
  readonly timeoutMs?: number;
}

export function buildEnsRpcClient(options: EnsRpcOptions): EnsRpcClient {
  if (options.rpcClient) return options.rpcClient;
  const url = options.mainnetRpcUrl ?? process.env.ALCHEMY_RPC_URL_MAINNET;
  if (!url) {
    throw new EnsFetchError('missing_rpc_url', 'ens: ALCHEMY_RPC_URL_MAINNET is not set');
  }
  return viemRpcClient(url, options.timeoutMs ?? DEFAULT_ENS_TIMEOUT_MS);
}

export interface EnsSubgraphSnapshot {
  readonly registrationTimestamp: number | null;
  readonly expiryTimestamp: number | null;
  readonly subnameCount: number;
  readonly textRecordKeys: ReadonlyArray<string>;
  readonly lastUpdateBlock: number | null;
}

const GRAPHQL_QUERY = `
query EnsInternalSignals($name: String!) {
  domains(where: { name: $name }, first: 1) {
    id
    createdAt
    expiryDate
    subdomainCount
    resolver {
      texts
      events(orderBy: blockNumber, orderDirection: desc, first: ${ENS_EVENTS_HEAD_WINDOW}) {
        __typename
        blockNumber
      }
    }
  }
}
`.trim();

interface DomainNode {
  readonly createdAt?: unknown;
  readonly expiryDate?: unknown;
  readonly subdomainCount?: unknown;
  readonly resolver?: {
    readonly texts?: unknown;
    readonly events?: ReadonlyArray<{
      readonly __typename?: unknown;
      readonly blockNumber?: unknown;
    }>;
  } | null;
}

function asNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function asTextKeys(raw: unknown): ReadonlyArray<string> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}

function parseLastUpdateBlock(
  events:
    | ReadonlyArray<{ readonly __typename?: unknown; readonly blockNumber?: unknown }>
    | undefined,
): number | null {
  if (!Array.isArray(events) || events.length === 0) return null;
  for (const ev of events) {
    if (ev === null || typeof ev !== 'object') continue;
    const typename = (ev as { __typename?: unknown }).__typename;
    if (typename !== undefined && typename !== 'TextChanged') continue;
    const block = asNumber((ev as { blockNumber?: unknown }).blockNumber);
    if (block !== null) return block;
  }
  return null;
}

export interface FetchEnsSubgraphOptions {
  readonly subgraphUrl?: string;
  readonly fetchImpl?: EnsFetchImpl;
  readonly timeoutMs?: number;
}

async function postSubgraph(
  url: string,
  ensName: string,
  fetchImpl: EnsFetchImpl,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ query: GRAPHQL_QUERY, variables: { name: ensName } }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new EnsFetchError(
      'subgraph_error',
      `ens: subgraph network error — ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readSubgraphJson(response: Response): Promise<Record<string, unknown>> {
  if (response.status < 200 || response.status >= 300) {
    throw new EnsFetchError('subgraph_error', `ens: subgraph HTTP ${response.status}`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new EnsFetchError(
      'subgraph_error',
      `ens: subgraph invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (typeof body !== 'object' || body === null) {
    throw new EnsFetchError('subgraph_error', 'ens: subgraph response is not an object');
  }
  return body as Record<string, unknown>;
}

function assertNoGraphqlErrors(obj: Record<string, unknown>): void {
  if (!Array.isArray(obj.errors) || obj.errors.length === 0) return;
  const head = obj.errors[0];
  const msg =
    head !== null && typeof head === 'object' && 'message' in head
      ? String((head as { message: unknown }).message)
      : JSON.stringify(head);
  throw new EnsFetchError('subgraph_error', `ens: subgraph graphql error — ${msg}`);
}

function extractDomain(obj: Record<string, unknown>): DomainNode | null {
  const data = (obj.data ?? null) as { domains?: ReadonlyArray<DomainNode> } | null;
  const domains = data?.domains;
  if (!Array.isArray(domains) || domains.length === 0) return null;
  const domain = domains[0];
  return domain ?? null;
}

function snapshotOf(domain: DomainNode): EnsSubgraphSnapshot {
  return {
    registrationTimestamp: asNumber(domain.createdAt),
    expiryTimestamp: asNumber(domain.expiryDate),
    subnameCount: asNumber(domain.subdomainCount) ?? 0,
    textRecordKeys: asTextKeys(domain.resolver?.texts),
    lastUpdateBlock: parseLastUpdateBlock(domain.resolver?.events),
  };
}

export async function fetchEnsSubgraph(
  ensName: string,
  options: FetchEnsSubgraphOptions = {},
): Promise<EnsSubgraphSnapshot | null> {
  const url = options.subgraphUrl ?? DEFAULT_ENS_SUBGRAPH_URL;
  const fetchImpl: EnsFetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_ENS_TIMEOUT_MS;
  const response = await postSubgraph(url, ensName, fetchImpl, timeoutMs);
  const obj = await readSubgraphJson(response);
  assertNoGraphqlErrors(obj);
  const domain = extractDomain(obj);
  return domain === null ? null : snapshotOf(domain);
}
