import type { AgentInput, AgentProvenance, AgentResult, SourceAgent } from '@veral/shared';
import { buildProvenance, CACHE_TTL, getOrFetch } from '@veral/shared';

import {
  buildEnsRpcClient,
  type EnsFetchImpl,
  type EnsRpcClient,
  fetchEnsSubgraph,
} from './client';
import { type EnsFindings, ensFindingsSchema } from './schema';

const AGENT_ID = 'ens-extract';
const AGENT_VERSION = '1.0.0';
const AGENT_DOMAIN = 'ens-internal';

// v1.0 ships mainnet only. Sepolia ENS uses a different registry +
// subgraph URL and is gated behind ADR follow-up.
export const ENS_MAINNET_CHAIN_ID = 1 as const;

type CacheFn = <T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>) => Promise<T>;

export interface EnsAgentOptions {
  readonly chainId?: typeof ENS_MAINNET_CHAIN_ID;
  readonly mainnetRpcUrl?: string;
  readonly subgraphUrl?: string;
  readonly fetchImpl?: EnsFetchImpl;
  readonly rpcClient?: EnsRpcClient;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  // Injectable so unit tests can pass a pass-through and skip Redis env wiring.
  readonly cache?: CacheFn;
}

function nowSecondsDefault(): number {
  return Math.floor(Date.now() / 1000);
}

function cacheKey(ensName: string): string {
  return `ens:${ensName.toLowerCase()}`;
}

interface RunBaseline {
  readonly runUuid: string;
  readonly startedAt: number;
  readonly now: () => number;
  readonly provenanceInput: { readonly namehash: `0x${string}`; readonly ensName: string };
  readonly backend: { readonly kind: 'rpc'; readonly chain: string; readonly provider: string };
}

function buildResult(
  base: RunBaseline,
  status: AgentResult<EnsFindings>['status'],
  findings: EnsFindings | null,
  provenance: AgentProvenance,
): AgentResult<EnsFindings> {
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

function emptyFindings(ensName: string, namehash: `0x${string}`): EnsFindings {
  return ensFindingsSchema.parse({
    trust: 'verified',
    ensName,
    namehash: namehash.toLowerCase(),
    registrationTimestamp: null,
    expiryTimestamp: null,
    subnameCount: 0,
    textRecordKeys: [],
    resolverAddress: null,
    lastUpdateBlock: null,
  });
}

interface FetchedSnapshot {
  readonly resolverAddress: `0x${string}` | null;
  readonly subgraph:
    | {
        readonly ok: true;
        readonly registrationTimestamp: number | null;
        readonly expiryTimestamp: number | null;
        readonly subnameCount: number;
        readonly textRecordKeys: ReadonlyArray<string>;
        readonly lastUpdateBlock: number | null;
      }
    | { readonly ok: false; readonly reason: string };
}

async function loadSnapshot(
  ensName: string,
  namehash: `0x${string}`,
  rpc: EnsRpcClient,
  options: EnsAgentOptions,
): Promise<FetchedSnapshot> {
  const resolverAddress = await rpc.resolverAddress(namehash);
  try {
    const snap = await fetchEnsSubgraph(ensName, {
      ...(options.subgraphUrl !== undefined ? { subgraphUrl: options.subgraphUrl } : {}),
      ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    });
    if (snap === null) {
      // Name not indexed — RPC-side resolver still meaningful.
      return {
        resolverAddress,
        subgraph: { ok: false, reason: 'name not indexed' },
      };
    }
    return {
      resolverAddress,
      subgraph: {
        ok: true,
        registrationTimestamp: snap.registrationTimestamp,
        expiryTimestamp: snap.expiryTimestamp,
        subnameCount: snap.subnameCount,
        textRecordKeys: snap.textRecordKeys,
        lastUpdateBlock: snap.lastUpdateBlock,
      },
    };
  } catch (err) {
    // Subgraph hard failure (network / HTTP / GraphQL error) — RPC half
    // of the snapshot is still valid; surface partial.
    return {
      resolverAddress,
      subgraph: {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

function buildFindings(
  ensName: string,
  namehash: `0x${string}`,
  snapshot: FetchedSnapshot,
): EnsFindings {
  if (snapshot.subgraph.ok) {
    return ensFindingsSchema.parse({
      trust: 'verified',
      ensName,
      namehash: namehash.toLowerCase(),
      registrationTimestamp: snapshot.subgraph.registrationTimestamp,
      expiryTimestamp: snapshot.subgraph.expiryTimestamp,
      subnameCount: snapshot.subgraph.subnameCount,
      textRecordKeys: snapshot.subgraph.textRecordKeys,
      resolverAddress: snapshot.resolverAddress,
      lastUpdateBlock: snapshot.subgraph.lastUpdateBlock,
    });
  }
  return ensFindingsSchema.parse({
    trust: 'verified',
    ensName,
    namehash: namehash.toLowerCase(),
    registrationTimestamp: null,
    expiryTimestamp: null,
    subnameCount: 0,
    textRecordKeys: [],
    resolverAddress: snapshot.resolverAddress,
    lastUpdateBlock: null,
  });
}

async function runFetch(
  cache: CacheFn,
  ensName: string,
  namehash: `0x${string}`,
  rpc: EnsRpcClient,
  options: EnsAgentOptions,
  base: RunBaseline,
): Promise<AgentResult<EnsFindings>> {
  try {
    const snapshot = await cache<FetchedSnapshot>(cacheKey(ensName), CACHE_TTL.ENS_RECORDS, () =>
      loadSnapshot(ensName, namehash, rpc, options),
    );
    const findings = buildFindings(ensName, namehash, snapshot);
    // 'ok' iff both RPC + subgraph returned data; otherwise 'partial'.
    // The score engine's ensRecency reads both lastUpdateBlock and
    // registrationDate, so missing-subgraph degrades to null_no_data.
    const status: AgentResult<EnsFindings>['status'] = snapshot.subgraph.ok ? 'ok' : 'partial';
    return buildResult(
      base,
      status,
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

export function createEnsAgent(options: EnsAgentOptions = {}): SourceAgent<EnsFindings> {
  const chainId = options.chainId ?? ENS_MAINNET_CHAIN_ID;
  if (chainId !== ENS_MAINNET_CHAIN_ID) {
    throw new Error(
      `ens-extract: chainId ${chainId} is not supported in v1.0 — mainnet only (ADR follow-up for sepolia)`,
    );
  }
  const now = options.now ?? nowSecondsDefault;
  const cache: CacheFn = options.cache ?? getOrFetch;

  return {
    id: AGENT_ID,
    version: AGENT_VERSION,
    domain: AGENT_DOMAIN,
    tierApplicability: ['Public', 'Anchored', 'Sealed'],
    schema: ensFindingsSchema,

    async run(input: AgentInput): Promise<AgentResult<EnsFindings>> {
      const ensName = input.subject.ensName;
      const namehash = input.subject.namehash;
      const base: RunBaseline = {
        runUuid: input.runUuid,
        startedAt: now(),
        now,
        provenanceInput: { namehash, ensName },
        backend: {
          kind: 'rpc',
          chain: 'ensdomains:mainnet',
          provider: 'alchemy+thegraph',
        },
      };

      let rpc: EnsRpcClient;
      try {
        rpc = buildEnsRpcClient({
          ...(options.mainnetRpcUrl !== undefined ? { mainnetRpcUrl: options.mainnetRpcUrl } : {}),
          ...(options.rpcClient !== undefined ? { rpcClient: options.rpcClient } : {}),
          ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        });
      } catch (err) {
        return buildResult(
          base,
          'error',
          null,
          buildProvenance({
            backend: base.backend,
            input: base.provenanceInput,
            errorMessage: err instanceof Error ? err.message : String(err),
          }),
        );
      }

      if (typeof ensName !== 'string' || ensName.length === 0) {
        // SubjectManifest guarantees ensName is set, but defend the
        // boundary so a misbehaving caller sees a typed status rather
        // than a Zod parse explosion inside the agent.
        return buildResult(
          base,
          'partial',
          emptyFindings(ensName ?? '', namehash),
          buildProvenance({ backend: base.backend, input: base.provenanceInput }),
        );
      }

      return runFetch(cache, ensName, namehash, rpc, options, base);
    },
  };
}

export const ensAgentMeta = {
  id: AGENT_ID,
  version: AGENT_VERSION,
  domain: AGENT_DOMAIN,
} as const;
