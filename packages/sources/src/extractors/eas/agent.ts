import type { AgentInput, AgentProvenance, AgentResult, SourceAgent } from '@veral/shared';
import { buildProvenance, CACHE_TTL, canonicalJson, getOrFetch, sha256Hex } from '@veral/shared';

import {
  DEFAULT_EAS_GRAPHQL_URL,
  type EasClientOptions,
  type EasFetchImpl,
  type EasRawAttestation,
  fetchAttestationsByRecipient,
  fetchAttestationsByTrustedIssuers,
} from './client';
import { type EasFindings, easFindingsSchema, type TrustedIssuer } from './schema';
import { DEFAULT_TRUSTED_ISSUERS } from './trusted-issuers';

const AGENT_ID = 'eas-extract';
const AGENT_VERSION = '1.0.0';
const AGENT_DOMAIN = 'eas';

// v1.0 ships mainnet only. EAS is deployed on Optimism, Base, and
// Arbitrum too; chainId-multiplex is gated behind ADR follow-up.
export const EAS_MAINNET_CHAIN_ID = 1 as const;

type CacheFn = <T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>) => Promise<T>;

export interface EasAgentOptions {
  readonly chainId?: typeof EAS_MAINNET_CHAIN_ID;
  readonly endpointUrl?: string;
  readonly fetchImpl?: EasFetchImpl;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  // Injectable so unit tests can pass a pass-through and skip Redis env wiring.
  readonly cache?: CacheFn;
  // Production wiring is expected to inject a curated allowlist from
  // packages/sources/src/extractors/eas/trusted-issuers.ts; tests
  // pass an inline fixture so the trust filter is observable.
  readonly trustedIssuers?: ReadonlyArray<TrustedIssuer>;
}

function nowSecondsDefault(): number {
  return Math.floor(Date.now() / 1000);
}

function uniqueLower(addresses: ReadonlyArray<`0x${string}`>): ReadonlyArray<`0x${string}`> {
  const seen = new Set<string>();
  const out: `0x${string}`[] = [];
  for (const addr of addresses) {
    const lower = addr.toLowerCase() as `0x${string}`;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}

interface RunBaseline {
  readonly runUuid: string;
  readonly startedAt: number;
  readonly now: () => number;
  readonly provenanceInput: {
    readonly namehash: `0x${string}`;
    readonly recipient: `0x${string}` | null;
    readonly issuerListHash: string;
  };
  readonly backend: {
    readonly kind: 'rest-api';
    readonly baseUrl: string;
    readonly version: string;
  };
}

function buildResult(
  base: RunBaseline,
  status: AgentResult<EasFindings>['status'],
  findings: EasFindings | null,
  provenance: AgentProvenance,
): AgentResult<EasFindings> {
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

function emptyFindings(chainId: number, recipient: `0x${string}` | null): EasFindings {
  return easFindingsSchema.parse({
    trust: 'verified',
    chainId,
    // recipient is required as a non-null address on the contract;
    // when the subject has no primaryAddress the agent surfaces a
    // partial status BEFORE schema parse, so this fallback only
    // matters when the caller misuses emptyFindings.
    recipient: recipient ?? ('0x0000000000000000000000000000000000000000' as `0x${string}`),
    attestationCount: 0,
    attestationsCapped: false,
    trustedAttestationCount: 0,
    trustedIssuerHits: [],
    callBudget: 0,
  });
}

// Each TrustedIssuer is keyed by (attester, schemaUid, chainId) — the
// triple has to match for an attestation to count. This Map is built
// once per run from the injected allowlist and consulted in the
// per-attestation loop below.
type IssuerKey = string;

function issuerKey(attester: `0x${string}`, schemaUid: `0x${string}`, chainId: number): IssuerKey {
  return `${chainId}:${attester.toLowerCase()}:${schemaUid.toLowerCase()}`;
}

function buildIssuerIndex(
  trustedIssuers: ReadonlyArray<TrustedIssuer>,
  chainId: number,
): ReadonlyMap<IssuerKey, TrustedIssuer> {
  const map = new Map<IssuerKey, TrustedIssuer>();
  for (const issuer of trustedIssuers) {
    if (issuer.chainId !== chainId) continue;
    map.set(issuerKey(issuer.issuer, issuer.schemaUid, issuer.chainId), issuer);
  }
  return map;
}

interface IssuerHitAccumulator {
  readonly issuerName: string;
  readonly category: TrustedIssuer['category'];
  count: number;
  latestTimestamp: number;
}

function computeTrustedSignal(
  attestations: ReadonlyArray<EasRawAttestation>,
  index: ReadonlyMap<IssuerKey, TrustedIssuer>,
  chainId: number,
): {
  readonly trustedAttestationCount: number;
  readonly trustedIssuerHits: ReadonlyArray<{
    readonly issuerName: string;
    readonly category: TrustedIssuer['category'];
    readonly count: number;
    readonly latestTimestamp: number;
  }>;
} {
  const hits = new Map<string, IssuerHitAccumulator>();
  let count = 0;
  for (const a of attestations) {
    const match = index.get(issuerKey(a.attester, a.schemaId, chainId));
    if (match === undefined) continue;
    count += 1;
    const existing = hits.get(match.name);
    if (existing === undefined) {
      hits.set(match.name, {
        issuerName: match.name,
        category: match.category,
        count: 1,
        latestTimestamp: a.time,
      });
    } else {
      existing.count += 1;
      if (a.time > existing.latestTimestamp) existing.latestTimestamp = a.time;
    }
  }
  // Sort by count desc, then name asc — stable UI ordering across runs.
  const sorted = Array.from(hits.values()).sort((a, b) =>
    a.count !== b.count ? b.count - a.count : a.issuerName.localeCompare(b.issuerName),
  );
  return {
    trustedAttestationCount: count,
    trustedIssuerHits: sorted.map((h) => ({
      issuerName: h.issuerName,
      category: h.category,
      count: h.count,
      latestTimestamp: h.latestTimestamp,
    })),
  };
}

interface FetchedSnapshot {
  readonly recipientAttestations: ReadonlyArray<EasRawAttestation>;
  readonly trustedAttestations: ReadonlyArray<EasRawAttestation>;
  readonly callBudget: number;
}

async function loadSnapshot(
  recipient: `0x${string}`,
  trustedIssuers: ReadonlyArray<TrustedIssuer>,
  chainId: number,
  options: EasAgentOptions,
  signal: AbortSignal | undefined,
): Promise<FetchedSnapshot> {
  const clientOptions: EasClientOptions = {
    ...(options.endpointUrl !== undefined ? { endpointUrl: options.endpointUrl } : {}),
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(signal ? { signal } : {}),
  };
  const trustedAttesters = uniqueLower(
    trustedIssuers.filter((i) => i.chainId === chainId).map((i) => i.issuer),
  );
  const recipientAttestations = await fetchAttestationsByRecipient(recipient, clientOptions);
  if (signal?.aborted) {
    return { recipientAttestations, trustedAttestations: [], callBudget: 1 };
  }
  if (trustedAttesters.length === 0) {
    return { recipientAttestations, trustedAttestations: [], callBudget: 1 };
  }
  const trustedAttestations = await fetchAttestationsByTrustedIssuers(
    recipient,
    trustedAttesters,
    clientOptions,
  );
  return { recipientAttestations, trustedAttestations, callBudget: 2 };
}

function buildFindings(
  chainId: number,
  recipient: `0x${string}`,
  snapshot: FetchedSnapshot,
  index: ReadonlyMap<IssuerKey, TrustedIssuer>,
): EasFindings {
  const trustedSignal = computeTrustedSignal(snapshot.trustedAttestations, index, chainId);
  return easFindingsSchema.parse({
    trust: 'verified',
    chainId,
    recipient: recipient.toLowerCase(),
    attestationCount: snapshot.recipientAttestations.length,
    attestationsCapped: snapshot.recipientAttestations.length === 100,
    trustedAttestationCount: trustedSignal.trustedAttestationCount,
    trustedIssuerHits: trustedSignal.trustedIssuerHits,
    callBudget: snapshot.callBudget,
  });
}

function issuerListHash(trustedIssuers: ReadonlyArray<TrustedIssuer>): string {
  // Cache key includes a stable hash of the allowlist so a curated-list
  // change in the follow-up PR invalidates existing entries instead of
  // serving stale "trustedAttestationCount = 0" snapshots.
  const normalised = trustedIssuers
    .map((i) => ({
      issuer: i.issuer.toLowerCase(),
      schemaUid: i.schemaUid.toLowerCase(),
      chainId: i.chainId,
    }))
    .sort((a, b) => {
      if (a.chainId !== b.chainId) return a.chainId - b.chainId;
      if (a.issuer !== b.issuer) return a.issuer.localeCompare(b.issuer);
      return a.schemaUid.localeCompare(b.schemaUid);
    });
  return sha256Hex(canonicalJson(normalised)).slice(0, 16);
}

function cacheKey(chainId: number, recipient: `0x${string}`, listHash: string): string {
  return `eas:${chainId}:${recipient.toLowerCase()}:${listHash}`;
}

async function runFetch(
  cache: CacheFn,
  recipient: `0x${string}`,
  trustedIssuers: ReadonlyArray<TrustedIssuer>,
  chainId: number,
  options: EasAgentOptions,
  base: RunBaseline,
  signal: AbortSignal | undefined,
): Promise<AgentResult<EasFindings>> {
  const index = buildIssuerIndex(trustedIssuers, chainId);
  try {
    const snapshot = await cache<FetchedSnapshot>(
      cacheKey(chainId, recipient, base.provenanceInput.issuerListHash),
      CACHE_TTL.EAS,
      () => loadSnapshot(recipient, trustedIssuers, chainId, options, signal),
    );
    const findings = buildFindings(chainId, recipient, snapshot, index);
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

export function createEasAgent(options: EasAgentOptions = {}): SourceAgent<EasFindings> {
  const chainId = options.chainId ?? EAS_MAINNET_CHAIN_ID;
  if (chainId !== EAS_MAINNET_CHAIN_ID) {
    throw new Error(
      `eas-extract: chainId ${chainId} is not supported in v1.0 — mainnet only (ADR follow-up for L2s)`,
    );
  }
  const now = options.now ?? nowSecondsDefault;
  const cache: CacheFn = options.cache ?? getOrFetch;
  const trustedIssuers = options.trustedIssuers ?? DEFAULT_TRUSTED_ISSUERS;
  const baseUrl = options.endpointUrl ?? DEFAULT_EAS_GRAPHQL_URL;

  return {
    id: AGENT_ID,
    version: AGENT_VERSION,
    domain: AGENT_DOMAIN,
    tierApplicability: ['Public', 'Anchored', 'Sealed'],
    schema: easFindingsSchema,

    async run(input: AgentInput): Promise<AgentResult<EasFindings>> {
      const namehash = input.subject.namehash;
      const recipient = input.subject.primaryAddress;
      const listHash = issuerListHash(trustedIssuers);
      const base: RunBaseline = {
        runUuid: input.runUuid,
        startedAt: now(),
        now,
        provenanceInput: { namehash, recipient, issuerListHash: listHash },
        backend: { kind: 'rest-api', baseUrl, version: 'easscan-graphql-v1' },
      };

      if (recipient === null) {
        // No primary address means EAS attestations cannot be looked
        // up — the subject's ENS manifest didn't bind to an address.
        // Surface partial with empty findings so the score adapter can
        // treat EAS as "absent" rather than an error.
        return buildResult(
          base,
          'partial',
          emptyFindings(chainId, null),
          buildProvenance({ backend: base.backend, input: base.provenanceInput }),
        );
      }

      const recipientLower = recipient.toLowerCase() as `0x${string}`;
      return runFetch(cache, recipientLower, trustedIssuers, chainId, options, base, input.signal);
    },
  };
}
