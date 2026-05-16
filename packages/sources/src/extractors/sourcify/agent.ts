import type { AgentInput, AgentResult, SourceAgent } from '@veral/shared';
import { buildProvenance, CACHE_TTL, getOrFetch } from '@veral/shared';

import { DEFAULT_SOURCIFY_BASE_URL, type FetchLike, fetchSourcifyContract } from './client';
import {
  type SourcifyContractFinding,
  type SourcifyFindings,
  sourcifyFindingsSchema,
} from './schema';

const AGENT_ID = 'sourcify-extract';
const AGENT_VERSION = '1.0.0';
const AGENT_DOMAIN = 'sourcify';

export type CacheFn = <T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>) => Promise<T>;

export interface SourcifyAgentOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  // Override the cache layer. Default uses Upstash via @veral/shared.
  // Injectable so unit tests can pass a pass-through and skip Redis env wiring.
  readonly cache?: CacheFn;
}

function resolveBaseUrl(override?: string): string {
  if (override) return override;
  return process.env.SOURCIFY_BASE_URL ?? DEFAULT_SOURCIFY_BASE_URL;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function cacheKey(chainId: number, address: `0x${string}`): string {
  return `sourcify:${chainId}:${address.toLowerCase()}`;
}

export function createSourcifyAgent(
  options: SourcifyAgentOptions = {},
): SourceAgent<SourcifyFindings> {
  const baseUrl = resolveBaseUrl(options.baseUrl);
  const now = options.now ?? nowSeconds;
  const cache: CacheFn = options.cache ?? getOrFetch;
  const baseFetchOptions = {
    baseUrl,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  };

  return {
    id: AGENT_ID,
    version: AGENT_VERSION,
    domain: AGENT_DOMAIN,
    tierApplicability: ['Public', 'Anchored', 'Sealed'],
    schema: sourcifyFindingsSchema,

    async run(input: AgentInput): Promise<AgentResult<SourcifyFindings>> {
      const runStartedAt = now();
      const declared = input.subject.declaredSources.sourcify;
      const provenanceInput = {
        namehash: input.subject.namehash,
        contracts: declared.map((c) => ({
          chainId: c.chainId,
          address: c.address.toLowerCase(),
        })),
      };
      const baseProvenance = buildProvenance({
        backend: { kind: 'rest-api', baseUrl, version: '2' },
        input: provenanceInput,
      });

      try {
        const contracts: SourcifyContractFinding[] = [];
        for (const entry of declared) {
          const finding = await cache<SourcifyContractFinding>(
            cacheKey(entry.chainId, entry.address),
            CACHE_TTL.SOURCIFY,
            () =>
              fetchSourcifyContract(entry.chainId, entry.address, {
                ...baseFetchOptions,
                ...(input.signal ? { signal: input.signal } : {}),
              }),
          );
          contracts.push(finding);
        }
        const findings = sourcifyFindingsSchema.parse({
          trust: 'verified',
          contracts,
          verifiedCount: contracts.filter((c) => c.match === 'exact_match').length,
          partialCount: contracts.filter((c) => c.match === 'match').length,
          notFoundCount: contracts.filter((c) => c.match === 'not_found').length,
        });
        return {
          agentId: AGENT_ID,
          agentVersion: AGENT_VERSION,
          runUuid: input.runUuid,
          runStartedAt,
          runFinishedAt: now(),
          status: declared.length === 0 ? 'partial' : 'ok',
          findings,
          provenance: baseProvenance,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          agentId: AGENT_ID,
          agentVersion: AGENT_VERSION,
          runUuid: input.runUuid,
          runStartedAt,
          runFinishedAt: now(),
          status: 'error',
          findings: null,
          provenance: buildProvenance({
            backend: { kind: 'rest-api', baseUrl, version: '2' },
            input: provenanceInput,
            errorMessage,
          }),
        };
      }
    },
  };
}

export const sourcifyAgentMeta = {
  id: AGENT_ID,
  version: AGENT_VERSION,
  domain: AGENT_DOMAIN,
} as const;
