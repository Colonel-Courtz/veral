import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL ??= 'http://kv.test.invalid';
  process.env.KV_REST_API_TOKEN ??= 'kv-test-token';
  process.env.TURSO_DATABASE_URL ??= 'file::memory:';
});

import type { AgentInput } from '@veral/shared';
import { describe, expect, it } from 'vitest';

import { type CacheFn, createSourcifyAgent } from '../agent';
import type { FetchLike } from '../client';

const SUBJECT_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7' as const;
const SUBJECT_NAMEHASH = `0x${'a'.repeat(64)}` as `0x${string}`;

// Pass-through cache lets tests focus on agent + client behavior without
// requiring Upstash env wiring.
const passThroughCache: CacheFn = (_key, _ttl, fetcher) => fetcher();

function makeInput(): AgentInput {
  return {
    subject: {
      ensName: 'alice.eth',
      namehash: SUBJECT_NAMEHASH,
      primaryAddress: SUBJECT_ADDRESS,
      kind: 'project',
      declaredSources: {
        sourcify: [{ chainId: 1, address: SUBJECT_ADDRESS, label: 'primary' }],
        github: null,
        onchain: null,
        ensInternal: { rootName: 'eth' },
      },
    },
    runUuid: '11111111-1111-1111-1111-111111111111',
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): FetchLike {
  return async (url: string, init?: RequestInit) => handler(url, init);
}

describe('createSourcifyAgent', () => {
  it('reports verified (exact_match) and surfaces compilation metadata', async () => {
    const fetchImpl = stubFetch((url) => {
      expect(url).toContain('/v2/contract/1/0xdac17f958d2ee523a2206206994597c13d831ec7');
      expect(url).toContain('fields=runtimeMatch,creationMatch,compilation');
      return jsonResponse({
        match: 'exact_match',
        runtimeMatch: 'exact_match',
        creationMatch: 'exact_match',
        compilation: {
          compilerVersion: '0.8.20+commit.a1b79de6',
          language: 'Solidity',
          name: 'Tether',
        },
      });
    });

    const agent = createSourcifyAgent({
      baseUrl: 'http://sourcify.test',
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(makeInput());

    expect(result.status).toBe('ok');
    expect(result.findings).not.toBeNull();
    expect(result.findings?.trust).toBe('verified');
    expect(result.findings?.verifiedCount).toBe(1);
    expect(result.findings?.contracts[0]?.compilerVersion).toBe('0.8.20+commit.a1b79de6');
    expect(result.findings?.contracts[0]?.contractName).toBe('Tether');
    expect(result.provenance.backend).toEqual({
      kind: 'rest-api',
      baseUrl: 'http://sourcify.test',
      version: '2',
    });
    expect(result.provenance.inputHash).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('classifies partial verification as match (not exact)', async () => {
    const fetchImpl = stubFetch(() =>
      jsonResponse({ match: 'match', compilation: { language: 'Solidity' } }),
    );
    const agent = createSourcifyAgent({
      baseUrl: 'http://sourcify.test',
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(makeInput());

    expect(result.status).toBe('ok');
    expect(result.findings?.contracts[0]?.match).toBe('match');
    expect(result.findings?.partialCount).toBe(1);
    expect(result.findings?.verifiedCount).toBe(0);
  });

  it('classifies HTTP 404 as not_found without throwing', async () => {
    const fetchImpl = stubFetch(() => new Response('not found', { status: 404 }));
    const agent = createSourcifyAgent({
      baseUrl: 'http://sourcify.test',
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(makeInput());

    expect(result.status).toBe('ok');
    expect(result.findings?.contracts[0]?.match).toBe('not_found');
    expect(result.findings?.notFoundCount).toBe(1);
  });

  it('returns status=error on network failure', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('fetch failed: ECONNREFUSED');
    };
    const agent = createSourcifyAgent({
      baseUrl: 'http://sourcify.test',
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(makeInput());

    expect(result.status).toBe('error');
    expect(result.findings).toBeNull();
    expect(result.provenance.errorMessage).toMatch(/network error/);
  });

  it('returns status=error on malformed JSON body', async () => {
    const fetchImpl = stubFetch(
      () =>
        new Response('<<not json>>', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const agent = createSourcifyAgent({
      baseUrl: 'http://sourcify.test',
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(makeInput());

    expect(result.status).toBe('error');
    expect(result.findings).toBeNull();
    expect(result.provenance.errorMessage).toMatch(/invalid JSON/);
  });

  it('returns status=error on rate_limited (HTTP 429)', async () => {
    const fetchImpl = stubFetch(() => new Response('slow down', { status: 429 }));
    const agent = createSourcifyAgent({
      baseUrl: 'http://sourcify.test',
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(makeInput());

    expect(result.status).toBe('error');
    expect(result.provenance.errorMessage).toMatch(/rate limited/);
  });

  it('keys the cache as sourcify:<chainId>:<lowercase-address>', async () => {
    const observed: Array<{ key: string; ttl: number }> = [];
    const recordingCache: CacheFn = async (key, ttl, fetcher) => {
      observed.push({ key, ttl });
      return fetcher();
    };
    const fetchImpl = stubFetch(() => jsonResponse({ match: 'exact_match', compilation: {} }));
    const agent = createSourcifyAgent({
      baseUrl: 'http://sourcify.test',
      fetchImpl,
      cache: recordingCache,
    });
    await agent.run(makeInput());

    expect(observed).toHaveLength(1);
    expect(observed[0]?.key).toBe(`sourcify:1:${SUBJECT_ADDRESS.toLowerCase()}`);
    expect(observed[0]?.ttl).toBe(60 * 60 * 24);
  });
});
