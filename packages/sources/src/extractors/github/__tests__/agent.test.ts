import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL ??= 'http://kv.test.invalid';
  process.env.KV_REST_API_TOKEN ??= 'kv-test-token';
  process.env.TURSO_DATABASE_URL ??= 'file::memory:';
});

import type { AgentInput, SubjectManifest } from '@veral/shared';

import { createGithubAgent } from '../agent';
import type { GithubFetchImpl } from '../client';

const SUBJECT_NAMEHASH = `0x${'a'.repeat(64)}` as `0x${string}`;
const OWNER = 'alice';

const passThroughCache = <T>(_key: string, _ttl: number, fetcher: () => Promise<T>) => fetcher();

function subjectWithOwner(owner: string | null): SubjectManifest {
  return {
    ensName: 'alice.eth',
    namehash: SUBJECT_NAMEHASH,
    primaryAddress: null,
    kind: 'project',
    declaredSources: {
      sourcify: [],
      github: owner === null ? null : { owner, verified: true },
      onchain: null,
      ensInternal: { rootName: 'eth' },
    },
  };
}

function input(owner: string | null = OWNER): AgentInput {
  return { subject: subjectWithOwner(owner), runUuid: 'run-1' };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface RouteMap {
  readonly [path: string]: () => Response | Promise<Response>;
}

function routerFetch(routes: RouteMap): GithubFetchImpl {
  return async (url) => {
    const parsed = new URL(url);
    const key = parsed.pathname + parsed.search;
    const handler = routes[key] ?? routes[parsed.pathname] ?? routes._default;
    if (!handler) return new Response('not configured', { status: 599 });
    return handler();
  };
}

const BASE = 'http://gh.test';

const userBody = (login: string, repos: number) => ({
  login,
  created_at: '2022-01-01T00:00:00Z',
  public_repos: repos,
});

const repoListBody = (repos: ReadonlyArray<{ name: string; stars: number }>) =>
  repos.map((r) => ({
    name: r.name,
    full_name: `${OWNER}/${r.name}`,
    pushed_at: '2026-05-01T00:00:00Z',
    stargazers_count: r.stars,
  }));

describe('createGithubAgent', () => {
  let originalToken: string | undefined;
  beforeEach(() => {
    originalToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });
  afterEach(() => {
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  });

  it('happy path: user + repos + per-repo P0 probes resolve to typed findings', async () => {
    const fetchImpl = routerFetch({
      [`/users/${OWNER}`]: () => jsonResponse(userBody(OWNER, 2)),
      [`/users/${OWNER}/repos?per_page=20&sort=updated`]: () =>
        jsonResponse(
          repoListBody([
            { name: 'alpha', stars: 100 },
            { name: 'beta', stars: 50 },
          ]),
        ),
      // alpha: full hygiene + test dir
      [`/repos/${OWNER}/alpha/contents/test`]: () => jsonResponse([{ name: 'foo.test.ts' }]),
      [`/repos/${OWNER}/alpha/contents/tests`]: () => new Response('not found', { status: 404 }),
      [`/repos/${OWNER}/alpha/contents/__tests__`]: () =>
        new Response('not found', { status: 404 }),
      [`/repos/${OWNER}/alpha/contents/spec`]: () => new Response('not found', { status: 404 }),
      [`/repos/${OWNER}/alpha/contents/README.md`]: () =>
        jsonResponse({ type: 'file', size: 2048 }),
      [`/repos/${OWNER}/alpha/license`]: () => jsonResponse({ license: { spdx_id: 'MIT' } }),
      // beta: README too short, no LICENSE, no test dir
      [`/repos/${OWNER}/beta/contents/test`]: () => new Response('not found', { status: 404 }),
      [`/repos/${OWNER}/beta/contents/tests`]: () => new Response('not found', { status: 404 }),
      [`/repos/${OWNER}/beta/contents/__tests__`]: () => new Response('not found', { status: 404 }),
      [`/repos/${OWNER}/beta/contents/spec`]: () => new Response('not found', { status: 404 }),
      [`/repos/${OWNER}/beta/contents/README.md`]: () => jsonResponse({ type: 'file', size: 50 }),
      [`/repos/${OWNER}/beta/license`]: () => new Response('not found', { status: 404 }),
    });

    const agent = createGithubAgent({
      token: 'tok',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(input());

    expect(result.status).toBe('ok');
    expect(result.findings?.trust).toBe('unverified');
    expect(result.findings?.user?.login).toBe(OWNER);
    expect(result.findings?.repos).toHaveLength(2);

    const alpha = result.findings?.repos.find((r) => r.name === 'alpha');
    expect(alpha?.hasTestDir).toBe(true);
    expect(alpha?.hasSubstantialReadme).toBe(true);
    expect(alpha?.hasLicense).toBe(true);

    const beta = result.findings?.repos.find((r) => r.name === 'beta');
    expect(beta?.hasTestDir).toBe(false);
    expect(beta?.hasSubstantialReadme).toBe(false);
    expect(beta?.hasLicense).toBe(false);

    // 1 (user) + 1 (list) + 2 × (4 dir probes + 1 README + 1 LICENSE) = 14
    expect(result.findings?.callBudget).toBe(14);

    expect(result.provenance.backend).toEqual({
      kind: 'rest-api',
      baseUrl: BASE,
      version: '2022-11-28',
    });
  });

  it('returns status=partial when subject has no declared github source', async () => {
    const agent = createGithubAgent({ token: 'tok', baseUrl: BASE });
    const result = await agent.run(input(null));
    expect(result.status).toBe('partial');
    expect(result.findings?.user).toBeNull();
    expect(result.findings?.repos).toEqual([]);
    expect(result.findings?.callBudget).toBe(0);
  });

  it('returns status=error when GITHUB_TOKEN is missing and no override is supplied', async () => {
    const agent = createGithubAgent({ baseUrl: BASE });
    const result = await agent.run(input());
    expect(result.status).toBe('error');
    expect(result.findings).toBeNull();
    expect(result.provenance.errorMessage).toMatch(/GITHUB_TOKEN/);
  });

  it('reads GITHUB_TOKEN from env when no override is supplied', async () => {
    process.env.GITHUB_TOKEN = 'env-token';
    const fetchImpl = routerFetch({
      [`/users/${OWNER}`]: () => jsonResponse(userBody(OWNER, 0)),
      [`/users/${OWNER}/repos?per_page=20&sort=updated`]: () => jsonResponse([]),
    });
    const agent = createGithubAgent({ baseUrl: BASE, fetchImpl, cache: passThroughCache });
    const result = await agent.run(input());
    expect(result.status).toBe('ok');
  });

  it('returns status=partial when the user is not found (404 → null user)', async () => {
    const fetchImpl = routerFetch({
      [`/users/${OWNER}`]: () => new Response('not found', { status: 404 }),
      [`/users/${OWNER}/repos?per_page=20&sort=updated`]: () => jsonResponse([]),
    });
    const agent = createGithubAgent({
      token: 'tok',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(input());
    expect(result.status).toBe('partial');
    expect(result.findings?.user).toBeNull();
    expect(result.findings?.repos).toEqual([]);
  });

  it('returns status=ok with empty repos when the owner has no public repos', async () => {
    const fetchImpl = routerFetch({
      [`/users/${OWNER}`]: () => jsonResponse(userBody(OWNER, 0)),
      [`/users/${OWNER}/repos?per_page=20&sort=updated`]: () => jsonResponse([]),
    });
    const agent = createGithubAgent({
      token: 'tok',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(input());
    expect(result.status).toBe('ok');
    expect(result.findings?.repos).toEqual([]);
    expect(result.findings?.callBudget).toBe(2);
  });

  it('returns status=error on a 403 rate-limit response', async () => {
    const fetchImpl = routerFetch({
      _default: () => new Response('rate limited', { status: 403 }),
    });
    const agent = createGithubAgent({
      token: 'tok',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(input());
    expect(result.status).toBe('error');
    expect(result.provenance.errorMessage).toMatch(/rate limited/);
  });

  it('returns status=error on malformed JSON in the user endpoint', async () => {
    const fetchImpl = routerFetch({
      [`/users/${OWNER}`]: () =>
        new Response('<<not json>>', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const agent = createGithubAgent({
      token: 'tok',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const result = await agent.run(input());
    expect(result.status).toBe('error');
    expect(result.provenance.errorMessage).toMatch(/invalid JSON|schema mismatch/);
  });

  it('keys the cache as github:<lowercase-owner>', async () => {
    const observed: Array<{ key: string; ttl: number }> = [];
    const recordingCache = async <T>(
      key: string,
      ttl: number,
      fetcher: () => Promise<T>,
    ): Promise<T> => {
      observed.push({ key, ttl });
      return fetcher();
    };
    const fetchImpl = routerFetch({
      [`/users/${OWNER}`]: () => jsonResponse(userBody(OWNER, 0)),
      [`/users/${OWNER}/repos?per_page=20&sort=updated`]: () => jsonResponse([]),
    });
    const agent = createGithubAgent({
      token: 'tok',
      baseUrl: BASE,
      fetchImpl,
      cache: recordingCache,
    });
    await agent.run(input('ALICE'));
    expect(observed).toHaveLength(1);
    expect(observed[0]?.key).toBe('github:alice');
    expect(observed[0]?.ttl).toBe(60 * 60);
  });

  it('respects topRepoCap so the per-subject HTTP budget stays bounded', async () => {
    const fetchImpl = routerFetch({
      [`/users/${OWNER}`]: () => jsonResponse(userBody(OWNER, 5)),
      [`/users/${OWNER}/repos?per_page=2&sort=updated`]: () =>
        jsonResponse(
          repoListBody([
            { name: 'a', stars: 1 },
            { name: 'b', stars: 2 },
          ]),
        ),
      // each repo gets 6 probes; default routes fall through to 404
      _default: () => new Response('not found', { status: 404 }),
    });
    const agent = createGithubAgent({
      token: 'tok',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
      topRepoCap: 2,
    });
    const result = await agent.run(input());
    expect(result.status).toBe('ok');
    expect(result.findings?.repos).toHaveLength(2);
    expect(result.findings?.callBudget).toBe(14);
  });

  it('a pre-aborted external signal short-circuits the first probe', async () => {
    let fetchInvoked = 0;
    const fetchImpl = routerFetch({
      _default: () => {
        fetchInvoked += 1;
        return jsonResponse({});
      },
    });
    const agent = createGithubAgent({
      token: 'tok',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const controller = new AbortController();
    controller.abort();
    const result = await agent.run({ ...input(), signal: controller.signal });
    expect(result.status).toBe('error');
    expect(result.provenance.errorMessage).toMatch(/aborted/);
    expect(fetchInvoked).toBe(0);
  });

  it('forwards a non-aborted external signal to the probe fetch', async () => {
    let observedSignal: AbortSignal | undefined;
    const fetchImpl: GithubFetchImpl = async (url, init) => {
      observedSignal = init?.signal ?? undefined;
      const parsed = new URL(url);
      if (parsed.pathname === `/users/${OWNER}`) {
        return jsonResponse(userBody(OWNER, 0));
      }
      return jsonResponse([]);
    };
    const agent = createGithubAgent({
      token: 'tok',
      baseUrl: BASE,
      fetchImpl,
      cache: passThroughCache,
    });
    const controller = new AbortController();
    await agent.run({ ...input(), signal: controller.signal });
    expect(observedSignal).toBeDefined();
    expect(observedSignal?.aborted).toBe(false);
  });
});
