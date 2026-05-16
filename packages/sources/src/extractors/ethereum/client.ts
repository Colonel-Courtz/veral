import { createPublicClient, http } from 'viem';
import { mainnet, sepolia } from 'viem/chains';

import type { EthereumFindings } from './schema';

export const ETHEREUM_MAINNET_CHAIN_ID = 1 as const;
export const ETHEREUM_SEPOLIA_CHAIN_ID = 11155111 as const;

export type SupportedChainId = typeof ETHEREUM_MAINNET_CHAIN_ID | typeof ETHEREUM_SEPOLIA_CHAIN_ID;

export type EthereumFetchErrorReason = 'missing_rpc_url' | 'unsupported_chain' | 'rpc_error';

export class EthereumAbortedError extends Error {
  readonly chainId: number;
  constructor(chainId: number, where: string) {
    super(`ethereum: aborted before ${where} on chain ${chainId}`);
    this.name = 'EthereumAbortedError';
    this.chainId = chainId;
  }
}

export class EthereumFetchError extends Error {
  readonly reason: EthereumFetchErrorReason;
  readonly chainId: number;
  constructor(reason: EthereumFetchErrorReason, chainId: number, message: string) {
    super(message);
    this.name = 'EthereumFetchError';
    this.reason = reason;
    this.chainId = chainId;
  }
}

// Narrow structural shape for the viem PublicClient methods this agent
// actually calls. Tests pass an in-memory stub matching this interface;
// production code passes a real PublicClient (which satisfies it).
export interface EthereumRpcClient {
  getBlockNumber(args?: { signal?: AbortSignal }): Promise<bigint>;
  getTransactionCount(args: {
    address: `0x${string}`;
    blockNumber: bigint;
    signal?: AbortSignal;
  }): Promise<number>;
  getBlock(args: {
    blockNumber: bigint;
    signal?: AbortSignal;
  }): Promise<{ readonly timestamp: bigint }>;
}

export interface EthereumClientOptions {
  readonly chainId?: SupportedChainId;
  // Inject a custom client for testing. Production callers omit and the
  // client is built from the chain-specific Alchemy RPC env var.
  readonly client?: EthereumRpcClient;
  readonly mainnetRpcUrl?: string;
  readonly sepoliaRpcUrl?: string;
  readonly timeoutMs?: number;
  // Orchestrator-supplied cancellation. viem actions do not currently
  // accept a per-call AbortSignal, so we check `aborted` between the
  // sequential RPC calls (head probe, nonce probe, binary-search
  // iterations) and refuse to fire new requests once cancelled.
  readonly signal?: AbortSignal;
}

function resolveRpcUrl(chainId: SupportedChainId, options: EthereumClientOptions): string {
  if (chainId === ETHEREUM_MAINNET_CHAIN_ID) {
    const url = options.mainnetRpcUrl ?? process.env.ALCHEMY_RPC_URL_MAINNET;
    if (!url) {
      throw new EthereumFetchError(
        'missing_rpc_url',
        chainId,
        'ethereum: ALCHEMY_RPC_URL_MAINNET is not set',
      );
    }
    return url;
  }
  const url = options.sepoliaRpcUrl ?? process.env.ALCHEMY_RPC_URL_SEPOLIA;
  if (!url) {
    throw new EthereumFetchError(
      'missing_rpc_url',
      chainId,
      'ethereum: ALCHEMY_RPC_URL_SEPOLIA is not set',
    );
  }
  return url;
}

function buildClient(chainId: SupportedChainId, options: EthereumClientOptions): EthereumRpcClient {
  if (options.client) return options.client;
  const url = resolveRpcUrl(chainId, options);
  const chain = chainId === ETHEREUM_MAINNET_CHAIN_ID ? mainnet : sepolia;
  return createPublicClient({
    chain,
    transport: http(url, {
      ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
    }),
  }) as unknown as EthereumRpcClient;
}

// Binary search for the smallest block in [0, hi] where nonce ≥ 1.
// Caller must verify nonce@hi ≥ 1 before calling. Each iteration is one
// getTransactionCount call → ~ceil(log2(hi)) RPC requests. At mainnet
// head ~25M that's ~25 calls — bounded and cheap.
async function findFirstTxBlock(
  client: EthereumRpcClient,
  address: `0x${string}`,
  latestBlock: bigint,
  signal: AbortSignal | undefined,
  chainId: number,
): Promise<bigint> {
  let lo = 0n;
  let hi = latestBlock;
  while (lo < hi) {
    if (signal?.aborted) throw new EthereumAbortedError(chainId, 'binary-search iteration');
    const mid = (lo + hi) / 2n;
    const n = await client.getTransactionCount({
      address,
      blockNumber: mid,
      ...(signal ? { signal } : {}),
    });
    if (n === 0) {
      lo = mid + 1n;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function toSafeNumber(value: bigint): number {
  // Block numbers max out below Number.MAX_SAFE_INTEGER for any
  // foreseeable chain. Cast preserves precision; if a future chain
  // breaches the ceiling we'll surface here loudly.
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new EthereumFetchError(
      'rpc_error',
      0,
      `ethereum: block number ${value} exceeds Number.MAX_SAFE_INTEGER`,
    );
  }
  return Number(value);
}

export async function fetchEthereumActivity(
  address: `0x${string}`,
  options: EthereumClientOptions = {},
): Promise<EthereumFindings> {
  const chainId: SupportedChainId = options.chainId ?? ETHEREUM_MAINNET_CHAIN_ID;
  const client = buildClient(chainId, options);
  const lowerAddress = address.toLowerCase() as `0x${string}`;

  if (options.signal?.aborted) throw new EthereumAbortedError(chainId, 'head probe');
  let latestBlock: bigint;
  let nonce: number;
  try {
    latestBlock = await client.getBlockNumber(options.signal ? { signal: options.signal } : {});
    if (options.signal?.aborted) throw new EthereumAbortedError(chainId, 'nonce probe');
    nonce = await client.getTransactionCount({
      address: lowerAddress,
      blockNumber: latestBlock,
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (err) {
    throw new EthereumFetchError(
      'rpc_error',
      chainId,
      `ethereum: head probe failed — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let firstTxBlock: number | null = null;
  let firstTxTimestamp: number | null = null;
  if (nonce > 0) {
    try {
      const block = await findFirstTxBlock(
        client,
        lowerAddress,
        latestBlock,
        options.signal,
        chainId,
      );
      firstTxBlock = toSafeNumber(block);
      const blockData = await client.getBlock({
        blockNumber: block,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      firstTxTimestamp = toSafeNumber(blockData.timestamp);
    } catch (err) {
      // Partial degrade — head probe succeeded so we keep nonce + latestBlock.
      // The binary search or timestamp lookup failed; first-tx fields stay null.
      // The score engine treats this as "activity present, age unknown" rather
      // than a hard error.
      firstTxBlock = null;
      firstTxTimestamp = null;
      void err;
    }
  }

  return {
    trust: 'verified',
    chainId,
    address: lowerAddress,
    nonce,
    firstTxBlock,
    firstTxTimestamp,
    latestBlock: toSafeNumber(latestBlock),
    // Indexer signals (alchemy_getAssetTransfers, deployer crosswalk)
    // are not wired in v1. Score engine handles null gracefully via the
    // nonce/cap-1000 fallback for onchainRecency.
    transferCountRecent90d: null,
    transferCountProvider: null,
    deployedContractCount: 0,
  };
}
