import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL ??= 'http://kv.test.invalid';
  process.env.KV_REST_API_TOKEN ??= 'kv-test-token';
  process.env.TURSO_DATABASE_URL ??= 'file::memory:';
});

import type { AgentInput, SubjectManifest } from '@veral/shared';

import { createEasAgent } from '../agent';
import type { EasFetchImpl } from '../client';
import type { TrustedIssuer } from '../schema';

const SUBJECT_NAMEHASH = `0x${'a'.repeat(64)}` as `0x${string}`;
const RECIPIENT = `0x${'1'.repeat(40)}` as `0x${string}`;
const ATTESTATION_ID = `0x${'b'.repeat(64)}` as `0x${string}`;

const ISSUER_COINBASE = `0x${'c'.repeat(40)}` as `0x${string}`;
const ISSUER_OPTIMISM = `0x${'d'.repeat(40)}` as `0x${string}`;
const SCHEMA_KYC = `0x${'e'.repeat(64)}` as `0x${string}`;
const SCHEMA_GOVERNANCE = `0x${'f'.repeat(64)}` as `0x${string}`;

const passThroughCache = <T>(_key: string, _ttl: number, fetcher: () => Promise<T>) => fetcher();

function subjectWith(primaryAddress: `0x${string}` | null): SubjectManifest {
  return {
    ensName: 'alice.eth',
    namehash: SUBJECT_NAMEHASH,
    primaryAddress,
    kind: 'project',
    declaredSources: {
      sourcify: [],
      github: null,
      onchain: null,
      ensInternal: { rootName: 'eth' },
    },
  };
}

function input(primaryAddress: `0x${string}` | null = RECIPIENT): AgentInput {
  return { subject: subjectWith(primaryAddress), runUuid: 'run-1' };
}

function attestationNode(overrides: {
  id?: string;
  attester?: string;
  recipient?: string;
  schemaId?: string;
  time?: number;
  revoked?: boolean;
  revocationTime?: number | null;
}) {
  return {
    id: overrides.id ?? ATTESTATION_ID,
    attester: overrides.attester ?? ISSUER_COINBASE,
    recipient: overrides.recipient ?? RECIPIENT,
    schemaId: overrides.schemaId ?? SCHEMA_KYC,
    time: overrides.time ?? 1_700_000_000,
    revoked: overrides.revoked ?? false,
    revocationTime: overrides.revocationTime ?? 0,
  };
}

function graphqlBody(attestations: ReadonlyArray<unknown>) {
  return { data: { attestations } };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface QueryRecord {
  readonly query: string;
  readonly variables: Record<string, unknown>;
}

function recordingFetch(routes: ReadonlyArray<() => Response>): {
  readonly fetchImpl: EasFetchImpl;
  readonly calls: ReadonlyArray<QueryRecord>;
} {
  const calls: QueryRecord[] = [];
  let i = 0;
  const fetchImpl: EasFetchImpl = async (_url, init) => {
    const body = init?.body;
    if (typeof body === 'string') {
      const parsed = JSON.parse(body) as { query: string; variables: Record<string, unknown> };
      calls.push(parsed);
    }
    const route = routes[i] ?? routes[routes.length - 1];
    i += 1;
    if (!route) throw new Error('eas test: no route configured');
    return route();
  };
  return { fetchImpl, calls };
}

const COINBASE_KYC: TrustedIssuer = {
  issuer: ISSUER_COINBASE,
  schemaUid: SCHEMA_KYC,
  chainId: 1,
  name: 'Coinbase Verifications',
  category: 'kyc',
  weight: 1.0,
};

const OPTIMISM_GOV: TrustedIssuer = {
  issuer: ISSUER_OPTIMISM,
  schemaUid: SCHEMA_GOVERNANCE,
  chainId: 1,
  name: 'Optimism Foundation',
  category: 'governance',
  weight: 0.9,
};

describe('createEasAgent', () => {
  it('partial when the subject has no primaryAddress (no network call)', async () => {
    let fetchInvoked = 0;
    const fetchImpl: EasFetchImpl = async () => {
      fetchInvoked += 1;
      return jsonResponse(graphqlBody([]));
    };
    const agent = createEasAgent({ fetchImpl, cache: passThroughCache });
    const result = await agent.run(input(null));
    expect(result.status).toBe('partial');
    expect(result.findings?.attestationCount).toBe(0);
    expect(result.findings?.callBudget).toBe(0);
    expect(fetchInvoked).toBe(0);
  });

  it('happy path: counts non-revoked attestations and surfaces trusted hits', async () => {
    const { fetchImpl, calls } = recordingFetch([
      () =>
        jsonResponse(
          graphqlBody([
            attestationNode({
              attester: ISSUER_COINBASE,
              schemaId: SCHEMA_KYC,
              time: 1_750_000_000,
            }),
            attestationNode({
              id: `0x${'2'.repeat(64)}`,
              attester: ISSUER_OPTIMISM,
              schemaId: SCHEMA_GOVERNANCE,
              time: 1_740_000_000,
            }),
            attestationNode({
              id: `0x${'3'.repeat(64)}`,
              attester: `0x${'9'.repeat(40)}`,
              schemaId: `0x${'8'.repeat(64)}`,
              time: 1_730_000_000,
            }),
          ]),
        ),
      () =>
        jsonResponse(
          graphqlBody([
            attestationNode({
              attester: ISSUER_COINBASE,
              schemaId: SCHEMA_KYC,
              time: 1_750_000_000,
            }),
            attestationNode({
              id: `0x${'2'.repeat(64)}`,
              attester: ISSUER_OPTIMISM,
              schemaId: SCHEMA_GOVERNANCE,
              time: 1_740_000_000,
            }),
          ]),
        ),
    ]);
    const agent = createEasAgent({
      fetchImpl,
      cache: passThroughCache,
      trustedIssuers: [COINBASE_KYC, OPTIMISM_GOV],
    });
    const result = await agent.run(input());
    expect(result.status).toBe('ok');
    expect(result.findings?.trust).toBe('verified');
    expect(result.findings?.attestationCount).toBe(3);
    expect(result.findings?.attestationsCapped).toBe(false);
    expect(result.findings?.trustedAttestationCount).toBe(2);
    expect(result.findings?.trustedIssuerHits).toEqual([
      {
        issuerName: 'Coinbase Verifications',
        category: 'kyc',
        count: 1,
        latestTimestamp: 1_750_000_000,
      },
      {
        issuerName: 'Optimism Foundation',
        category: 'governance',
        count: 1,
        latestTimestamp: 1_740_000_000,
      },
    ]);
    expect(result.findings?.callBudget).toBe(2);
    expect(calls).toHaveLength(2);
    // Trusted query must constrain attesters via { in: [...] }.
    expect(calls[1]?.variables.attesters).toEqual([ISSUER_COINBASE, ISSUER_OPTIMISM]);
  });

  it('only one HTTP call when the trusted-issuer list is empty', async () => {
    const { fetchImpl, calls } = recordingFetch([
      () => jsonResponse(graphqlBody([attestationNode({})])),
    ]);
    const agent = createEasAgent({
      fetchImpl,
      cache: passThroughCache,
      trustedIssuers: [],
    });
    const result = await agent.run(input());
    expect(result.status).toBe('ok');
    expect(result.findings?.attestationCount).toBe(1);
    expect(result.findings?.trustedAttestationCount).toBe(0);
    expect(result.findings?.trustedIssuerHits).toEqual([]);
    expect(result.findings?.callBudget).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('only matched (attester, schemaUid) pairs count as trusted', async () => {
    const { fetchImpl } = recordingFetch([
      () => jsonResponse(graphqlBody([])),
      () =>
        jsonResponse(
          // attester is trusted but schemaId is unrelated — must not count.
          graphqlBody([
            attestationNode({
              attester: ISSUER_COINBASE,
              schemaId: `0x${'7'.repeat(64)}`,
              time: 1_700_000_000,
            }),
          ]),
        ),
    ]);
    const agent = createEasAgent({
      fetchImpl,
      cache: passThroughCache,
      trustedIssuers: [COINBASE_KYC],
    });
    const result = await agent.run(input());
    expect(result.status).toBe('ok');
    expect(result.findings?.trustedAttestationCount).toBe(0);
    expect(result.findings?.trustedIssuerHits).toEqual([]);
  });

  it('aggregates multiple attestations from the same trusted issuer with the latest timestamp', async () => {
    const { fetchImpl } = recordingFetch([
      () => jsonResponse(graphqlBody([])),
      () =>
        jsonResponse(
          graphqlBody([
            attestationNode({
              attester: ISSUER_COINBASE,
              schemaId: SCHEMA_KYC,
              time: 1_720_000_000,
            }),
            attestationNode({
              id: `0x${'2'.repeat(64)}`,
              attester: ISSUER_COINBASE,
              schemaId: SCHEMA_KYC,
              time: 1_760_000_000,
            }),
            attestationNode({
              id: `0x${'3'.repeat(64)}`,
              attester: ISSUER_COINBASE,
              schemaId: SCHEMA_KYC,
              time: 1_710_000_000,
            }),
          ]),
        ),
    ]);
    const agent = createEasAgent({
      fetchImpl,
      cache: passThroughCache,
      trustedIssuers: [COINBASE_KYC],
    });
    const result = await agent.run(input());
    expect(result.findings?.trustedAttestationCount).toBe(3);
    expect(result.findings?.trustedIssuerHits).toEqual([
      {
        issuerName: 'Coinbase Verifications',
        category: 'kyc',
        count: 3,
        latestTimestamp: 1_760_000_000,
      },
    ]);
  });

  it('attestationsCapped is true when the recipient-broad query returns exactly 100 rows', async () => {
    const hundred = Array.from({ length: 100 }, (_, i) =>
      attestationNode({ id: `0x${i.toString(16).padStart(64, '0')}`, time: 1_700_000_000 + i }),
    );
    const { fetchImpl } = recordingFetch([() => jsonResponse(graphqlBody(hundred))]);
    const agent = createEasAgent({
      fetchImpl,
      cache: passThroughCache,
      trustedIssuers: [],
    });
    const result = await agent.run(input());
    expect(result.findings?.attestationCount).toBe(100);
    expect(result.findings?.attestationsCapped).toBe(true);
  });

  it('status=error on GraphQL errors array', async () => {
    const { fetchImpl } = recordingFetch([
      () =>
        jsonResponse({
          errors: [{ message: 'Unknown field "attestations" on type "Query"' }],
        }),
    ]);
    const agent = createEasAgent({
      fetchImpl,
      cache: passThroughCache,
      trustedIssuers: [],
    });
    const result = await agent.run(input());
    expect(result.status).toBe('error');
    expect(result.provenance.errorMessage).toMatch(/graphql error/);
  });

  it('status=error on HTTP 503 without retrying', async () => {
    let invoked = 0;
    const fetchImpl: EasFetchImpl = async () => {
      invoked += 1;
      return new Response('upstream down', { status: 503 });
    };
    const agent = createEasAgent({
      fetchImpl,
      cache: passThroughCache,
      trustedIssuers: [],
    });
    const result = await agent.run(input());
    expect(result.status).toBe('error');
    expect(result.provenance.errorMessage).toMatch(/HTTP 503/);
    expect(invoked).toBe(1);
  });

  it('issuers on a different chain are ignored by the in-memory index', async () => {
    const { fetchImpl } = recordingFetch([
      () => jsonResponse(graphqlBody([])),
      () =>
        jsonResponse(
          graphqlBody([
            attestationNode({
              attester: ISSUER_COINBASE,
              schemaId: SCHEMA_KYC,
              time: 1_700_000_000,
            }),
          ]),
        ),
    ]);
    const wrongChain: TrustedIssuer = { ...COINBASE_KYC, chainId: 10 };
    const agent = createEasAgent({
      fetchImpl,
      cache: passThroughCache,
      trustedIssuers: [wrongChain],
    });
    const result = await agent.run(input());
    expect(result.status).toBe('ok');
    // Trusted query is not skipped (the issuer is in the input list), but
    // the (attester, schema, chainId) index has no entry for chainId 1 →
    // no hits.
    expect(result.findings?.trustedAttestationCount).toBe(0);
  });

  it('cache key changes when the trusted-issuer list changes', async () => {
    const observed: string[] = [];
    const recordingCache = async <T>(
      key: string,
      _ttl: number,
      fetcher: () => Promise<T>,
    ): Promise<T> => {
      observed.push(key);
      return fetcher();
    };
    const { fetchImpl } = recordingFetch([
      () => jsonResponse(graphqlBody([])),
      () => jsonResponse(graphqlBody([])),
      () => jsonResponse(graphqlBody([])),
      () => jsonResponse(graphqlBody([])),
    ]);
    const empty = createEasAgent({ fetchImpl, cache: recordingCache, trustedIssuers: [] });
    const seeded = createEasAgent({
      fetchImpl,
      cache: recordingCache,
      trustedIssuers: [COINBASE_KYC],
    });
    await empty.run(input());
    await seeded.run(input());
    expect(observed).toHaveLength(2);
    expect(observed[0]).not.toBe(observed[1]);
  });

  it('a pre-aborted external signal short-circuits the first request', async () => {
    let invoked = 0;
    const fetchImpl: EasFetchImpl = async () => {
      invoked += 1;
      return jsonResponse(graphqlBody([]));
    };
    const agent = createEasAgent({ fetchImpl, cache: passThroughCache, trustedIssuers: [] });
    const controller = new AbortController();
    controller.abort();
    const result = await agent.run({ ...input(), signal: controller.signal });
    expect(result.status).toBe('error');
    expect(result.provenance.errorMessage).toMatch(/aborted/);
    expect(invoked).toBe(0);
  });

  it('does not run the trusted query if the abort signal fires between requests', async () => {
    let invoked = 0;
    const controller = new AbortController();
    const fetchImpl: EasFetchImpl = async () => {
      invoked += 1;
      if (invoked === 1) {
        controller.abort();
        return jsonResponse(graphqlBody([attestationNode({})]));
      }
      return jsonResponse(graphqlBody([]));
    };
    const agent = createEasAgent({
      fetchImpl,
      cache: passThroughCache,
      trustedIssuers: [COINBASE_KYC],
    });
    const result = await agent.run({ ...input(), signal: controller.signal });
    expect(result.status).toBe('ok');
    expect(invoked).toBe(1);
    expect(result.findings?.callBudget).toBe(1);
  });
});
