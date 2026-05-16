import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL ??= 'http://kv.test.invalid';
  process.env.KV_REST_API_TOKEN ??= 'kv-test-token';
  process.env.TURSO_DATABASE_URL ??= 'file::memory:';
});

import type { AgentInput, SubjectManifest } from '@veral/shared';

import { createEnsAgent } from '../agent';
import type { EnsFetchImpl, EnsRpcClient } from '../client';

const SUBJECT_NAMEHASH = `0x${'a'.repeat(64)}` as `0x${string}`;
const RESOLVER = `0x${'b'.repeat(40)}` as `0x${string}`;

const passThroughCache = <T>(_key: string, _ttl: number, fetcher: () => Promise<T>) => fetcher();

function subjectWith(ensName: string): SubjectManifest {
  return {
    ensName,
    namehash: SUBJECT_NAMEHASH,
    primaryAddress: null,
    kind: 'project',
    declaredSources: {
      sourcify: [],
      github: null,
      onchain: null,
      ensInternal: { rootName: 'eth' },
    },
  };
}

function input(ensName = 'alice.eth'): AgentInput {
  return { subject: subjectWith(ensName), runUuid: 'run-1' };
}

function rpcStub(resolver: `0x${string}` | null): EnsRpcClient {
  return {
    async resolverAddress() {
      return resolver;
    },
  };
}

function rpcThrowing(): EnsRpcClient {
  return {
    async resolverAddress() {
      throw new Error('rpc: registry read failed');
    },
  };
}

function subgraphFetch(body: unknown, status = 200): EnsFetchImpl {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
}

function subgraphErrorFetch(httpStatus: number): EnsFetchImpl {
  return async () => new Response('upstream error', { status: httpStatus });
}

function emptyDomainsBody() {
  return { data: { domains: [] } };
}

function happyDomainsBody(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      domains: [
        {
          id: '0x...',
          createdAt: '1700000000',
          expiryDate: '1731536000',
          subdomainCount: 3,
          resolver: {
            texts: ['url', 'avatar', 'com.github'],
            events: [
              { __typename: 'TextChanged', blockNumber: '20000000' },
              { __typename: 'AddrChanged', blockNumber: '20100000' },
            ],
          },
          ...overrides,
        },
      ],
    },
  };
}

describe('createEnsAgent', () => {
  let originalRpc: string | undefined;
  beforeEach(() => {
    originalRpc = process.env.ALCHEMY_RPC_URL_MAINNET;
    delete process.env.ALCHEMY_RPC_URL_MAINNET;
  });
  afterEach(() => {
    if (originalRpc === undefined) delete process.env.ALCHEMY_RPC_URL_MAINNET;
    else process.env.ALCHEMY_RPC_URL_MAINNET = originalRpc;
  });

  it('happy path: RPC resolver + subgraph snapshot → status ok with all fields', async () => {
    const agent = createEnsAgent({
      rpcClient: rpcStub(RESOLVER),
      fetchImpl: subgraphFetch(happyDomainsBody()),
      cache: passThroughCache,
    });
    const result = await agent.run(input());

    expect(result.status).toBe('ok');
    expect(result.findings?.trust).toBe('verified');
    expect(result.findings?.ensName).toBe('alice.eth');
    expect(result.findings?.namehash).toBe(SUBJECT_NAMEHASH.toLowerCase());
    expect(result.findings?.registrationTimestamp).toBe(1_700_000_000);
    expect(result.findings?.expiryTimestamp).toBe(1_731_536_000);
    expect(result.findings?.subnameCount).toBe(3);
    expect(result.findings?.textRecordKeys).toEqual(['url', 'avatar', 'com.github']);
    expect(result.findings?.resolverAddress).toBe(RESOLVER.toLowerCase());
    // First TextChanged event in head window — the AddrChanged ahead of
    // it is correctly skipped.
    expect(result.findings?.lastUpdateBlock).toBe(20_000_000);
    expect(result.provenance.backend).toEqual({
      kind: 'rpc',
      chain: 'ensdomains:mainnet',
      provider: 'alchemy+thegraph',
    });
  });

  it('unregistered name (empty domains array) → status partial with nulls and resolver-only', async () => {
    const agent = createEnsAgent({
      rpcClient: rpcStub(null),
      fetchImpl: subgraphFetch(emptyDomainsBody()),
      cache: passThroughCache,
    });
    const result = await agent.run(input('unregistered.eth'));

    expect(result.status).toBe('partial');
    expect(result.findings?.registrationTimestamp).toBeNull();
    expect(result.findings?.expiryTimestamp).toBeNull();
    expect(result.findings?.subnameCount).toBe(0);
    expect(result.findings?.textRecordKeys).toEqual([]);
    expect(result.findings?.resolverAddress).toBeNull();
    expect(result.findings?.lastUpdateBlock).toBeNull();
  });

  it('no RPC env → status error referencing the env var', async () => {
    const agent = createEnsAgent({ cache: passThroughCache });
    const result = await agent.run(input());
    expect(result.status).toBe('error');
    expect(result.findings).toBeNull();
    expect(result.provenance.errorMessage).toMatch(/ALCHEMY_RPC_URL_MAINNET/);
  });

  it('subgraph 503 but RPC ok → status partial with RPC-derived resolverAddress', async () => {
    const agent = createEnsAgent({
      rpcClient: rpcStub(RESOLVER),
      fetchImpl: subgraphErrorFetch(503),
      cache: passThroughCache,
    });
    const result = await agent.run(input());
    expect(result.status).toBe('partial');
    expect(result.findings?.resolverAddress).toBe(RESOLVER.toLowerCase());
    expect(result.findings?.subnameCount).toBe(0);
    expect(result.findings?.lastUpdateBlock).toBeNull();
  });

  it('zero subnames → subnameCount === 0 explicit (not null)', async () => {
    const agent = createEnsAgent({
      rpcClient: rpcStub(RESOLVER),
      fetchImpl: subgraphFetch(happyDomainsBody({ subdomainCount: 0 })),
      cache: passThroughCache,
    });
    const result = await agent.run(input());
    expect(result.status).toBe('ok');
    expect(result.findings?.subnameCount).toBe(0);
  });

  it('GraphQL error response → status partial (subgraph half failed)', async () => {
    const agent = createEnsAgent({
      rpcClient: rpcStub(RESOLVER),
      fetchImpl: subgraphFetch({ errors: [{ message: 'query depth exceeded' }] }),
      cache: passThroughCache,
    });
    const result = await agent.run(input());
    expect(result.status).toBe('partial');
    expect(result.findings?.resolverAddress).toBe(RESOLVER.toLowerCase());
    expect(result.findings?.registrationTimestamp).toBeNull();
  });

  it('RPC throw → status error', async () => {
    const agent = createEnsAgent({
      rpcClient: rpcThrowing(),
      fetchImpl: subgraphFetch(happyDomainsBody()),
      cache: passThroughCache,
    });
    const result = await agent.run(input());
    expect(result.status).toBe('error');
    expect(result.provenance.errorMessage).toMatch(/registry read failed/);
  });

  it('keys the cache as ens:<lowercase-ensName>', async () => {
    const observed: Array<{ key: string; ttl: number }> = [];
    const recordingCache = async <T>(
      key: string,
      ttl: number,
      fetcher: () => Promise<T>,
    ): Promise<T> => {
      observed.push({ key, ttl });
      return fetcher();
    };
    const agent = createEnsAgent({
      rpcClient: rpcStub(RESOLVER),
      fetchImpl: subgraphFetch(happyDomainsBody()),
      cache: recordingCache,
    });
    await agent.run(input('Alice.ETH'));
    expect(observed).toHaveLength(1);
    expect(observed[0]?.key).toBe('ens:alice.eth');
    expect(observed[0]?.ttl).toBe(60 * 5);
  });

  it('rejects sepolia chainId at construction time', () => {
    expect(() => createEnsAgent({ chainId: 11155111 as unknown as 1 })).toThrow(/mainnet only/);
  });

  it('a pre-aborted external signal makes the rpc stub see signal.aborted', async () => {
    let observedAborted: boolean | undefined;
    const rpc = {
      async resolverAddress(_namehash: `0x${string}`, options?: { signal?: AbortSignal }) {
        observedAborted = options?.signal?.aborted;
        return RESOLVER;
      },
    };
    const agent = createEnsAgent({
      rpcClient: rpc,
      fetchImpl: subgraphFetch(emptyDomainsBody()),
      cache: passThroughCache,
    });
    const controller = new AbortController();
    controller.abort();
    await agent.run({ ...input(), signal: controller.signal });
    expect(observedAborted).toBe(true);
  });

  it('forwards a non-aborted external signal into the subgraph fetch', async () => {
    let observedSignal: AbortSignal | undefined;
    const fetchImpl: EnsFetchImpl = async (_url, init) => {
      observedSignal = init?.signal ?? undefined;
      return new Response(JSON.stringify(emptyDomainsBody()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const agent = createEnsAgent({
      rpcClient: rpcStub(RESOLVER),
      fetchImpl,
      cache: passThroughCache,
    });
    const controller = new AbortController();
    await agent.run({ ...input(), signal: controller.signal });
    expect(observedSignal).toBeDefined();
    expect(observedSignal?.aborted).toBe(false);
  });
});
