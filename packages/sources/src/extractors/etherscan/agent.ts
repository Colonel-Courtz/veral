import type { AgentInput, AgentProvenance, AgentResult, SourceAgent } from '@veral/shared';
import { buildProvenance, CACHE_TTL, getOrFetch } from '@veral/shared';

import {
  DEFAULT_ETHERSCAN_BASE_URL,
  type EtherscanClientOptions,
  type EtherscanFetchImpl,
  fetchEtherscanContract,
} from './client';
import {
  type EtherscanContractFinding,
  type EtherscanFindings,
  etherscanFindingsSchema,
} from './schema';

const AGENT_ID = 'etherscan-extract';
const AGENT_VERSION = '1.0.0';
const AGENT_DOMAIN = 'etherscan';

type CacheFn = <T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>) => Promise<T>;

export interface EtherscanAgentOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: EtherscanFetchImpl;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  // Injectable so unit tests can pass a pass-through and skip Redis env wiring.
  readonly cache?: CacheFn;
}

function nowSecondsDefault(): number {
  return Math.floor(Date.now() / 1000);
}

function resolveApiKey(override?: string): string | null {
  return override ?? process.env.ETHERSCAN_API_KEY ?? null;
}

function cacheKey(chainId: number, address: `0x${string}`): string {
  return `etherscan:${chainId}:${address.toLowerCase()}`;
}

interface RunBaseline {
  readonly runUuid: string;
  readonly startedAt: number;
  readonly now: () => number;
  readonly provenanceInput: {
    readonly namehash: `0x${string}`;
    readonly contracts: ReadonlyArray<{ readonly chainId: number; readonly address: string }>;
  };
  readonly backend: {
    readonly kind: 'rest-api';
    readonly baseUrl: string;
    readonly version: string;
  };
}

function buildResult(
  base: RunBaseline,
  status: AgentResult<EtherscanFindings>['status'],
  findings: EtherscanFindings | null,
  provenance: AgentProvenance,
): AgentResult<EtherscanFindings> {
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

function emptyFindings(): EtherscanFindings {
  return etherscanFindingsSchema.parse({
    trust: 'unverified',
    contracts: [],
    verifiedCount: 0,
    callBudget: 0,
  });
}

async function runFetch(
  cache: CacheFn,
  apiKey: string,
  declared: ReadonlyArray<{ readonly chainId: number; readonly address: `0x${string}` }>,
  options: EtherscanAgentOptions,
  base: RunBaseline,
  signal: AbortSignal | undefined,
): Promise<AgentResult<EtherscanFindings>> {
  const baseFetchOptions: Omit<EtherscanClientOptions, 'apiKey'> = {
    baseUrl: base.backend.baseUrl,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  };
  try {
    const contracts: EtherscanContractFinding[] = [];
    let callBudget = 0;
    for (const entry of declared) {
      if (signal?.aborted) {
        throw new Error('etherscan: aborted before next contract probe');
      }
      callBudget += 1;
      const finding = await cache<EtherscanContractFinding>(
        cacheKey(entry.chainId, entry.address),
        CACHE_TTL.ETHERSCAN,
        () =>
          fetchEtherscanContract(entry.chainId, entry.address, {
            apiKey,
            ...baseFetchOptions,
            ...(signal ? { signal } : {}),
          }),
      );
      contracts.push(finding);
    }
    const findings = etherscanFindingsSchema.parse({
      trust: 'unverified',
      contracts,
      verifiedCount: contracts.filter((c) => c.etherscanVerified).length,
      callBudget,
    });
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

export function createEtherscanAgent(
  options: EtherscanAgentOptions = {},
): SourceAgent<EtherscanFindings> {
  const now = options.now ?? nowSecondsDefault;
  const cache: CacheFn = options.cache ?? getOrFetch;
  const baseUrl = options.baseUrl ?? DEFAULT_ETHERSCAN_BASE_URL;

  return {
    id: AGENT_ID,
    version: AGENT_VERSION,
    domain: AGENT_DOMAIN,
    tierApplicability: ['Public', 'Anchored', 'Sealed'],
    schema: etherscanFindingsSchema,

    async run(input: AgentInput): Promise<AgentResult<EtherscanFindings>> {
      const declared = input.subject.declaredSources.sourcify;
      const base: RunBaseline = {
        runUuid: input.runUuid,
        startedAt: now(),
        now,
        provenanceInput: {
          namehash: input.subject.namehash,
          contracts: declared.map((c) => ({
            chainId: c.chainId,
            address: c.address.toLowerCase(),
          })),
        },
        backend: { kind: 'rest-api', baseUrl, version: 'v2' },
      };

      if (declared.length === 0) {
        // No sourcify-declared contracts means nothing to cross-check.
        // Surface partial with empty findings so the orchestrator
        // distinguishes "ran with nothing to do" from "API failure".
        return buildResult(
          base,
          'partial',
          emptyFindings(),
          buildProvenance({ backend: base.backend, input: base.provenanceInput }),
        );
      }
      const apiKey = resolveApiKey(options.apiKey);
      if (apiKey === null) {
        return buildResult(
          base,
          'error',
          null,
          buildProvenance({
            backend: base.backend,
            input: base.provenanceInput,
            errorMessage: 'etherscan: ETHERSCAN_API_KEY is not set',
          }),
        );
      }

      return runFetch(cache, apiKey, declared, options, base, input.signal);
    },
  };
}
