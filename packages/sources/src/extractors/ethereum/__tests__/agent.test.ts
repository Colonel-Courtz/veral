import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL ??= 'http://kv.test.invalid';
  process.env.KV_REST_API_TOKEN ??= 'kv-test-token';
  process.env.TURSO_DATABASE_URL ??= 'file::memory:';
});

import type { AgentInput, SubjectManifest } from '@veral/shared';

import { createEthereumAgent } from '../agent';
import type { EthereumRpcClient } from '../client';

const SUBJECT_NAMEHASH = `0x${'a'.repeat(64)}` as `0x${string}`;
const ADDRESS = `0x${'d'.repeat(40)}` as `0x${string}`;

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
      onchain: primaryAddress === null ? null : { primaryAddress },
      ensInternal: { rootName: 'eth' },
    },
  };
}

function input(primaryAddress: `0x${string}` | null = ADDRESS): AgentInput {
  return { subject: subjectWith(primaryAddress), runUuid: 'run-1' };
}

interface StubClientSpec {
  readonly latestBlock: bigint;
  // Map blockNumber → nonce. Latest is implicit (whatever nonce returned
  // for the head). Tests can specify partial maps.
  readonly nonceAt: ReadonlyMap<bigint, number>;
  // Optional override for getBlockNumber throws / getTransactionCount throws.
  readonly throwOn?: 'getBlockNumber' | 'getTransactionCount' | 'getBlock';
}

function stubClient(spec: StubClientSpec): EthereumRpcClient {
  return {
    async getBlockNumber() {
      if (spec.throwOn === 'getBlockNumber') throw new Error('rpc: head probe failed');
      return spec.latestBlock;
    },
    async getTransactionCount({ blockNumber }) {
      if (spec.throwOn === 'getTransactionCount') throw new Error('rpc: nonce probe failed');
      // Return the highest known nonce at or below blockNumber. If no
      // entry exists at or below blockNumber, nonce is 0.
      let best = 0;
      for (const [b, n] of spec.nonceAt) {
        if (b <= blockNumber && n > best) best = n;
      }
      return best;
    },
    async getBlock({ blockNumber }) {
      if (spec.throwOn === 'getBlock') throw new Error('rpc: block fetch failed');
      // 12-second mainnet block time anchor: timestamp = block * 12 + 1700000000.
      return { timestamp: BigInt(Number(blockNumber) * 12 + 1_700_000_000) };
    },
  };
}

describe('createEthereumAgent', () => {
  let originalMainnet: string | undefined;
  let originalSepolia: string | undefined;
  beforeEach(() => {
    originalMainnet = process.env.ALCHEMY_RPC_URL_MAINNET;
    originalSepolia = process.env.ALCHEMY_RPC_URL_SEPOLIA;
    delete process.env.ALCHEMY_RPC_URL_MAINNET;
    delete process.env.ALCHEMY_RPC_URL_SEPOLIA;
  });
  afterEach(() => {
    if (originalMainnet === undefined) delete process.env.ALCHEMY_RPC_URL_MAINNET;
    else process.env.ALCHEMY_RPC_URL_MAINNET = originalMainnet;
    if (originalSepolia === undefined) delete process.env.ALCHEMY_RPC_URL_SEPOLIA;
    else process.env.ALCHEMY_RPC_URL_SEPOLIA = originalSepolia;
  });

  it('happy path: address with tx history → nonce + firstTxBlock + timestamp', async () => {
    const client = stubClient({
      latestBlock: 20_000_000n,
      nonceAt: new Map([
        [5_000_000n, 1],
        [20_000_000n, 42],
      ]),
    });
    const agent = createEthereumAgent({ client, cache: passThroughCache });
    const result = await agent.run(input());

    expect(result.status).toBe('ok');
    expect(result.findings?.trust).toBe('verified');
    expect(result.findings?.chainId).toBe(1);
    expect(result.findings?.address).toBe(ADDRESS.toLowerCase());
    expect(result.findings?.nonce).toBe(42);
    expect(result.findings?.latestBlock).toBe(20_000_000);
    expect(result.findings?.firstTxBlock).toBe(5_000_000);
    expect(result.findings?.firstTxTimestamp).toBe(5_000_000 * 12 + 1_700_000_000);
    expect(result.findings?.transferCountRecent90d).toBeNull();
    expect(result.findings?.deployedContractCount).toBe(0);
    expect(result.provenance.backend).toEqual({
      kind: 'rpc',
      chain: 'ethereum:1',
      provider: 'alchemy',
    });
  });

  it('fresh address (nonce=0) → kind:ok with firstTx nulls', async () => {
    const client = stubClient({ latestBlock: 20_000_000n, nonceAt: new Map() });
    const agent = createEthereumAgent({ client, cache: passThroughCache });
    const result = await agent.run(input());

    expect(result.status).toBe('ok');
    expect(result.findings?.nonce).toBe(0);
    expect(result.findings?.firstTxBlock).toBeNull();
    expect(result.findings?.firstTxTimestamp).toBeNull();
    expect(result.findings?.latestBlock).toBe(20_000_000);
  });

  it('subject has no declared onchain → status:partial with placeholder findings', async () => {
    const agent = createEthereumAgent();
    const result = await agent.run(input(null));
    expect(result.status).toBe('partial');
    expect(result.findings?.address).toBe(`0x${'0'.repeat(40)}`);
    expect(result.findings?.nonce).toBe(0);
    expect(result.findings?.firstTxBlock).toBeNull();
  });

  it('RPC env missing → status:error referencing the env var', async () => {
    const agent = createEthereumAgent({ cache: passThroughCache });
    const result = await agent.run(input());
    expect(result.status).toBe('error');
    expect(result.findings).toBeNull();
    expect(result.provenance.errorMessage).toMatch(/ALCHEMY_RPC_URL_MAINNET/);
  });

  it('reads ALCHEMY_RPC_URL_MAINNET from env when no override is supplied', async () => {
    process.env.ALCHEMY_RPC_URL_MAINNET = 'https://eth-mainnet.g.alchemy.com/v2/test';
    // Inject a client so the env-resolved URL is never actually used as a
    // transport — the test only confirms the env path doesn't throw.
    const client = stubClient({ latestBlock: 1n, nonceAt: new Map() });
    const agent = createEthereumAgent({ client, cache: passThroughCache });
    const result = await agent.run(input());
    expect(result.status).toBe('ok');
  });

  it('RPC throw on head probe → status:error', async () => {
    const client = stubClient({
      latestBlock: 0n,
      nonceAt: new Map(),
      throwOn: 'getBlockNumber',
    });
    const agent = createEthereumAgent({ client, cache: passThroughCache });
    const result = await agent.run(input());
    expect(result.status).toBe('error');
    expect(result.provenance.errorMessage).toMatch(/head probe failed/);
  });

  it('partial RPC failure during binary search → kind:ok with firstTx nulls', async () => {
    // Nonce > 0 at head triggers the binary search; throwing on a later
    // getTransactionCount mid-search degrades to ok with null first-tx
    // fields rather than aborting.
    let calls = 0;
    const client: EthereumRpcClient = {
      async getBlockNumber() {
        return 20_000_000n;
      },
      async getTransactionCount({ blockNumber }) {
        calls += 1;
        // First call (nonce at head) succeeds with non-zero.
        if (calls === 1 && blockNumber === 20_000_000n) return 5;
        // All subsequent calls throw.
        throw new Error('rpc: mid-search transport failure');
      },
      async getBlock() {
        throw new Error('should not be called');
      },
    };
    const agent = createEthereumAgent({ client, cache: passThroughCache });
    const result = await agent.run(input());
    expect(result.status).toBe('ok');
    expect(result.findings?.nonce).toBe(5);
    expect(result.findings?.firstTxBlock).toBeNull();
    expect(result.findings?.firstTxTimestamp).toBeNull();
  });

  it('keys the cache as ethereum:<chainId>:<lowercase-address>', async () => {
    const observed: Array<{ key: string; ttl: number }> = [];
    const recordingCache = async <T>(
      key: string,
      ttl: number,
      fetcher: () => Promise<T>,
    ): Promise<T> => {
      observed.push({ key, ttl });
      return fetcher();
    };
    const client = stubClient({ latestBlock: 1n, nonceAt: new Map() });
    const upperAddress = ADDRESS.toUpperCase() as `0x${string}`;
    const agent = createEthereumAgent({ client, cache: recordingCache });
    await agent.run(input(upperAddress));
    expect(observed).toHaveLength(1);
    expect(observed[0]?.key).toBe(`ethereum:1:${ADDRESS.toLowerCase()}`);
    expect(observed[0]?.ttl).toBe(60 * 5);
  });

  it('chainId override resolves to ethereum:<chainId> in provenance backend', async () => {
    const client = stubClient({ latestBlock: 1n, nonceAt: new Map() });
    const agent = createEthereumAgent({
      client,
      cache: passThroughCache,
      chainId: 11155111,
    });
    const result = await agent.run(input());
    expect(result.provenance.backend).toEqual({
      kind: 'rpc',
      chain: 'ethereum:11155111',
      provider: 'alchemy',
    });
  });
});
