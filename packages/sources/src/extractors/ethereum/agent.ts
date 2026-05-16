import type { AgentInput, AgentProvenance, AgentResult, SourceAgent } from '@veral/shared';
import { buildProvenance, CACHE_TTL, getOrFetch } from '@veral/shared';

import {
  ETHEREUM_MAINNET_CHAIN_ID,
  type EthereumClientOptions,
  type EthereumRpcClient,
  fetchEthereumActivity,
  type SupportedChainId,
} from './client';
import { type EthereumFindings, ethereumFindingsSchema } from './schema';

const AGENT_ID = 'ethereum-extract';
const AGENT_VERSION = '1.0.0';
const AGENT_DOMAIN = 'onchain';

type CacheFn = <T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>) => Promise<T>;

export interface EthereumAgentOptions {
  readonly chainId?: SupportedChainId;
  readonly client?: EthereumRpcClient;
  readonly mainnetRpcUrl?: string;
  readonly sepoliaRpcUrl?: string;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  // Injectable so unit tests can pass a pass-through and skip Redis env wiring.
  readonly cache?: CacheFn;
}

function nowSecondsDefault(): number {
  return Math.floor(Date.now() / 1000);
}

function cacheKey(chainId: number, address: `0x${string}`): string {
  return `ethereum:${chainId}:${address.toLowerCase()}`;
}

interface RunBaseline {
  readonly runUuid: string;
  readonly startedAt: number;
  readonly now: () => number;
  readonly provenanceInput: {
    readonly namehash: `0x${string}`;
    readonly chainId: number;
    readonly address: string | null;
  };
  readonly backend: {
    readonly kind: 'rpc';
    readonly chain: string;
    readonly provider: string;
  };
}

function buildResult(
  base: RunBaseline,
  status: AgentResult<EthereumFindings>['status'],
  findings: EthereumFindings | null,
  provenance: AgentProvenance,
): AgentResult<EthereumFindings> {
  return {
    agentId: AGENT_ID,
    agentVersion: AGENT_VERSION,
    runUuid: base.runUuid,
    runStartedAt: base.startedAt,
    runFinishedAt: base.now(),
    status,
    findings,
    provenance,
  };
}

function emptyFindings(chainId: number): EthereumFindings {
  // chainId is preserved on partial returns so the score-adapter knows
  // which network was probed even when there was no declared address.
  return ethereumFindingsSchema.parse({
    trust: 'verified',
    chainId,
    address: `0x${'0'.repeat(40)}`,
    nonce: 0,
    firstTxBlock: null,
    firstTxTimestamp: null,
    latestBlock: 0,
    transferCountRecent90d: null,
    transferCountProvider: null,
    deployedContractCount: 0,
  });
}

async function runFetch(
  cache: CacheFn,
  address: `0x${string}`,
  options: EthereumClientOptions,
  base: RunBaseline,
): Promise<AgentResult<EthereumFindings>> {
  const chainId = options.chainId ?? ETHEREUM_MAINNET_CHAIN_ID;
  try {
    const findings = await cache<EthereumFindings>(
      cacheKey(chainId, address),
      CACHE_TTL.ONCHAIN,
      async () => {
        const fetched = await fetchEthereumActivity(address, options);
        return ethereumFindingsSchema.parse(fetched);
      },
    );
    return buildResult(
      base,
      'ok',
      findings,
      buildProvenance({ backend: base.backend, input: base.provenanceInput }),
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return buildResult(
      base,
      'error',
      null,
      buildProvenance({ backend: base.backend, input: base.provenanceInput, errorMessage }),
    );
  }
}

export function createEthereumAgent(
  options: EthereumAgentOptions = {},
): SourceAgent<EthereumFindings> {
  const now = options.now ?? nowSecondsDefault;
  const cache: CacheFn = options.cache ?? getOrFetch;
  const chainId: SupportedChainId = options.chainId ?? ETHEREUM_MAINNET_CHAIN_ID;

  return {
    id: AGENT_ID,
    version: AGENT_VERSION,
    domain: AGENT_DOMAIN,
    tierApplicability: ['Public', 'Anchored', 'Sealed'],
    schema: ethereumFindingsSchema,

    async run(input: AgentInput): Promise<AgentResult<EthereumFindings>> {
      const declared = input.subject.declaredSources.onchain;
      const declaredAddress = declared?.primaryAddress ?? null;
      const base: RunBaseline = {
        runUuid: input.runUuid,
        startedAt: now(),
        now,
        provenanceInput: {
          namehash: input.subject.namehash,
          chainId,
          address: declaredAddress?.toLowerCase() ?? null,
        },
        backend: {
          kind: 'rpc',
          chain: `ethereum:${chainId}`,
          provider: 'alchemy',
        },
      };

      if (declaredAddress === null) {
        return buildResult(
          base,
          'partial',
          emptyFindings(chainId),
          buildProvenance({ backend: base.backend, input: base.provenanceInput }),
        );
      }

      const clientOptions: EthereumClientOptions = {
        chainId,
        ...(options.client ? { client: options.client } : {}),
        ...(options.mainnetRpcUrl ? { mainnetRpcUrl: options.mainnetRpcUrl } : {}),
        ...(options.sepoliaRpcUrl ? { sepoliaRpcUrl: options.sepoliaRpcUrl } : {}),
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
      };

      return runFetch(cache, declaredAddress, clientOptions, base);
    },
  };
}

export const ethereumAgentMeta = {
  id: AGENT_ID,
  version: AGENT_VERSION,
  domain: AGENT_DOMAIN,
} as const;
