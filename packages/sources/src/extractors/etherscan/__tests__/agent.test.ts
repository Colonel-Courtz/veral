import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL ??= 'http://kv.test.invalid';
  process.env.KV_REST_API_TOKEN ??= 'kv-test-token';
  process.env.TURSO_DATABASE_URL ??= 'file::memory:';
});

import type { AgentInput, SubjectManifest } from '@veral/shared';

import { createEtherscanAgent } from '../agent';
import type { EtherscanFetchImpl } from '../client';

const SUBJECT_NAMEHASH = `0x${'a'.repeat(64)}` as `0x${string}`;
const ADDR_A = `0x${'1'.repeat(40)}` as `0x${string}`;
const ADDR_B = `0x${'2'.repeat(40)}` as `0x${string}`;

const passThroughCache = <T>(_key: string, _ttl: number, fetcher: () => Promise<T>) => fetcher();

function subjectWithContracts(
  contracts: ReadonlyArray<{ chainId: number; address: `0x${string}` }>,
): SubjectManifest {
  return {
    ensName: 'alice.eth',
    namehash: SUBJECT_NAMEHASH,
    primaryAddress: null,
    kind: 'project',
    declaredSources: {
      sourcify: contracts.map((c) => ({ ...c, label: null })),
      github: null,
      onchain: null,
      ensInternal: { rootName: 'eth' },
    },
  };
}

function input(
  contracts: ReadonlyArray<{ chainId: number; address: `0x${string}` }> = [
    { chainId: 1, address: ADDR_A },
  ],
): AgentInput {
  return { subject: subjectWithContracts(contracts), runUuid: 'run-1' };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function verifiedBody(overrides?: Partial<Record<string, string>>) {
  return {
    status: '1',
    message: 'OK',
    result: [
      {
        SourceCode: '// SPDX-License-Identifier: MIT\ncontract Foo {}',
        ABI: '[]',
        ContractName: 'Foo',
        CompilerVersion: 'v0.8.20+commit.a1b79de6',
        OptimizationUsed: '1',
        Runs: '200',
        ConstructorArguments: '',
        EVMVersion: 'Default',
        Library: '',
        LicenseType: 'MIT',
        Proxy: '0',
        Implementation: '',
        SwarmSource: '',
        ...(overrides ?? {}),
      },
    ],
  };
}

function unverifiedBody() {
  return {
    status: '0',
    message: 'NOTOK',
    result: [
      {
        SourceCode: '',
        ABI: 'Contract source code not verified',
        ContractName: '',
        CompilerVersion: '',
        OptimizationUsed: '',
        Runs: '',
        ConstructorArguments: '',
        EVMVersion: '',
        Library: '',
        LicenseType: '',
        Proxy: '0',
        Implementation: '',
        SwarmSource: '',
      },
    ],
  };
}

interface CapturedRequest {
  readonly url: string;
  readonly searchParams: URLSearchParams;
}

function recordingFetch(routes: ReadonlyArray<() => Response>): {
  readonly fetchImpl: EtherscanFetchImpl;
  readonly calls: ReadonlyArray<CapturedRequest>;
} {
  const calls: CapturedRequest[] = [];
  let i = 0;
  const fetchImpl: EtherscanFetchImpl = async (url) => {
    const parsed = new URL(url);
    calls.push({ url: parsed.toString(), searchParams: parsed.searchParams });
    const route = routes[i] ?? routes[routes.length - 1];
    i += 1;
    if (!route) throw new Error('etherscan test: no route configured');
    return route();
  };
  return { fetchImpl, calls };
}

const BASE = 'http://etherscan.test';

describe('createEtherscanAgent', () => {
  let originalKey: string | undefined;
  beforeEach(() => {
    originalKey = process.env.ETHERSCAN_API_KEY;
    delete process.env.ETHERSCAN_API_KEY;
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.ETHERSCAN_API_KEY;
    else process.env.ETHERSCAN_API_KEY = originalKey;
  });

  it('partial with empty findings when no sourcify contracts are declared', async () => {
    let fetchInvoked = 0;
    const fetchImpl: EtherscanFetchImpl = async () => {
      fetchInvoked += 1;
      return jsonResponse(unverifiedBody());
    };
    const agent = createEtherscanAgent({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(input([]));
    expect(result.status).toBe('partial');
    expect(result.findings?.trust).toBe('unverified');
    expect(result.findings?.contracts).toEqual([]);
    expect(result.findings?.verifiedCount).toBe(0);
    expect(result.findings?.callBudget).toBe(0);
    expect(fetchInvoked).toBe(0);
  });

  it('error when ETHERSCAN_API_KEY is missing and no override is supplied', async () => {
    const agent = createEtherscanAgent({ baseUrl: BASE });
    const result = await agent.run(input());
    expect(result.status).toBe('error');
    expect(result.findings).toBeNull();
    expect(result.provenance.errorMessage).toMatch(/ETHERSCAN_API_KEY/);
  });

  it('happy path: verified contract surfaces etherscanVerified=true and compiler metadata', async () => {
    const { fetchImpl, calls } = recordingFetch([() => jsonResponse(verifiedBody())]);
    const agent = createEtherscanAgent({
      apiKey: 'kfromopt',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(input([{ chainId: 1, address: ADDR_A }]));
    expect(result.status).toBe('ok');
    expect(result.findings?.contracts).toHaveLength(1);
    const finding = result.findings?.contracts[0];
    expect(finding?.etherscanVerified).toBe(true);
    expect(finding?.compilerVersion).toBe('v0.8.20+commit.a1b79de6');
    expect(finding?.contractName).toBe('Foo');
    expect(finding?.hasProxy).toBe(false);
    expect(result.findings?.verifiedCount).toBe(1);
    expect(result.findings?.callBudget).toBe(1);
    // v2 endpoint should pass chainid + module + action + address + apikey.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.searchParams.get('chainid')).toBe('1');
    expect(calls[0]?.searchParams.get('module')).toBe('contract');
    expect(calls[0]?.searchParams.get('action')).toBe('getsourcecode');
    expect(calls[0]?.searchParams.get('address')).toBe(ADDR_A);
    expect(calls[0]?.searchParams.get('apikey')).toBe('kfromopt');
  });

  it('unverified contract surfaces etherscanVerified=false with null metadata', async () => {
    const { fetchImpl } = recordingFetch([() => jsonResponse(unverifiedBody())]);
    const agent = createEtherscanAgent({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(input([{ chainId: 1, address: ADDR_A }]));
    expect(result.status).toBe('ok');
    const finding = result.findings?.contracts[0];
    expect(finding?.etherscanVerified).toBe(false);
    expect(finding?.compilerVersion).toBeNull();
    expect(finding?.contractName).toBeNull();
    expect(finding?.hasProxy).toBe(false);
    expect(result.findings?.verifiedCount).toBe(0);
  });

  it('Proxy=1 in the result is surfaced as hasProxy=true', async () => {
    const { fetchImpl } = recordingFetch([
      () => jsonResponse(verifiedBody({ Proxy: '1', Implementation: ADDR_B })),
    ]);
    const agent = createEtherscanAgent({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(input([{ chainId: 1, address: ADDR_A }]));
    const finding = result.findings?.contracts[0];
    expect(finding?.hasProxy).toBe(true);
  });

  it('iterates all declared sourcify contracts and accumulates verifiedCount + callBudget', async () => {
    const { fetchImpl, calls } = recordingFetch([
      () => jsonResponse(verifiedBody({ ContractName: 'A' })),
      () => jsonResponse(unverifiedBody()),
    ]);
    const agent = createEtherscanAgent({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(
      input([
        { chainId: 1, address: ADDR_A },
        { chainId: 1, address: ADDR_B },
      ]),
    );
    expect(result.status).toBe('ok');
    expect(result.findings?.contracts).toHaveLength(2);
    expect(result.findings?.verifiedCount).toBe(1);
    expect(result.findings?.callBudget).toBe(2);
    expect(calls.map((c) => c.searchParams.get('address'))).toEqual([ADDR_A, ADDR_B]);
  });

  it('reads ETHERSCAN_API_KEY from env when no override is supplied', async () => {
    process.env.ETHERSCAN_API_KEY = 'env-key';
    const { fetchImpl, calls } = recordingFetch([() => jsonResponse(verifiedBody())]);
    const agent = createEtherscanAgent({ baseUrl: BASE, fetchImpl, cache: passThroughCache });
    const result = await agent.run(input());
    expect(result.status).toBe('ok');
    expect(calls[0]?.searchParams.get('apikey')).toBe('env-key');
  });

  it('status=error on HTTP 503 without retry', async () => {
    let invoked = 0;
    const fetchImpl: EtherscanFetchImpl = async () => {
      invoked += 1;
      return new Response('upstream down', { status: 503 });
    };
    const agent = createEtherscanAgent({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(input());
    expect(result.status).toBe('error');
    expect(result.provenance.errorMessage).toMatch(/HTTP 503/);
    expect(invoked).toBe(1);
  });

  it('status=error on Etherscan rate-limit message (status=0, result is a string)', async () => {
    const { fetchImpl } = recordingFetch([
      () =>
        jsonResponse({
          status: '0',
          message: 'NOTOK',
          result: 'Max rate limit reached, please use API Key for higher rate limit',
        }),
    ]);
    const agent = createEtherscanAgent({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(input());
    expect(result.status).toBe('error');
    expect(result.provenance.errorMessage).toMatch(/rate limit/i);
  });

  it('status=error when the API result entry is malformed (not an object)', async () => {
    const { fetchImpl } = recordingFetch([
      () => jsonResponse({ status: '1', message: 'OK', result: ['not-an-object'] }),
    ]);
    const agent = createEtherscanAgent({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(input());
    expect(result.status).toBe('error');
    expect(result.provenance.errorMessage).toMatch(/etherscan/);
  });

  it('forwards the AbortSignal to the underlying fetch', async () => {
    let observedSignal: AbortSignal | undefined;
    const fetchImpl: EtherscanFetchImpl = async (_url, init) => {
      observedSignal = init?.signal ?? undefined;
      return jsonResponse(verifiedBody());
    };
    const agent = createEtherscanAgent({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const controller = new AbortController();
    await agent.run({ ...input(), signal: controller.signal });
    expect(observedSignal).toBeDefined();
    expect(observedSignal?.aborted).toBe(false);
  });

  it('a pre-aborted external signal short-circuits without firing a request', async () => {
    let invoked = 0;
    const fetchImpl: EtherscanFetchImpl = async () => {
      invoked += 1;
      return jsonResponse(verifiedBody());
    };
    const agent = createEtherscanAgent({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const controller = new AbortController();
    controller.abort();
    const result = await agent.run({ ...input(), signal: controller.signal });
    expect(result.status).toBe('error');
    expect(invoked).toBe(0);
  });

  it('keys the cache as etherscan:<chainId>:<lowercase-address>', async () => {
    const observed: Array<{ key: string; ttl: number }> = [];
    const recordingCache = async <T>(
      key: string,
      ttl: number,
      fetcher: () => Promise<T>,
    ): Promise<T> => {
      observed.push({ key, ttl });
      return fetcher();
    };
    const { fetchImpl } = recordingFetch([() => jsonResponse(verifiedBody())]);
    const agent = createEtherscanAgent({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl,
      cache: recordingCache,
    });
    await agent.run(input([{ chainId: 1, address: ADDR_A }]));
    expect(observed).toHaveLength(1);
    expect(observed[0]?.key).toBe(`etherscan:1:${ADDR_A.toLowerCase()}`);
    expect(observed[0]?.ttl).toBe(60 * 60 * 24);
  });
});
