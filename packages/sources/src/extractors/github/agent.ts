import type { AgentInput, AgentProvenance, AgentResult, SourceAgent } from '@veral/shared';
import { buildProvenance, CACHE_TTL, getOrFetch } from '@veral/shared';

import {
  DEFAULT_GITHUB_BASE_URL,
  fetchGithubP0,
  type GithubClientOptions,
  type GithubFetchImpl,
  type GithubFetchResult,
} from './client';
import { type GithubFindings, githubFindingsSchema } from './schema';

const AGENT_ID = 'github-extract';
const AGENT_VERSION = '1.0.0';
const AGENT_DOMAIN = 'github';

const BACKEND_VERSION = '2022-11-28+graphql-v4';

type CacheFn = <T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>) => Promise<T>;

export interface GithubAgentOptions {
  readonly token?: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: GithubFetchImpl;
  readonly timeoutMs?: number;
  readonly topRepoCap?: number;
  readonly readmeBytesThreshold?: number;
  readonly now?: () => number;
  // Injectable so unit tests can pass a pass-through and skip Redis env wiring.
  readonly cache?: CacheFn;
}

function resolveToken(override?: string): string | null {
  return override ?? process.env.GITHUB_TOKEN ?? null;
}

function nowSecondsDefault(): number {
  return Math.floor(Date.now() / 1000);
}

function cacheKey(owner: string): string {
  return `github:${owner.toLowerCase()}`;
}

function emptyFindings(): GithubFindings {
  return githubFindingsSchema.parse({
    trust: 'unverified',
    user: null,
    repos: [],
    callBudget: 0,
  });
}

interface RunBaseline {
  readonly runUuid: string;
  readonly startedAt: number;
  readonly now: () => number;
  readonly provenanceInput: { readonly namehash: `0x${string}`; readonly owner: string | null };
  readonly backend: {
    readonly kind: 'rest-api';
    readonly baseUrl: string;
    readonly version: string;
  };
}

function buildResult(
  base: RunBaseline,
  status: AgentResult<GithubFindings>['status'],
  findings: GithubFindings | null,
  provenance: AgentProvenance,
): AgentResult<GithubFindings> {
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

function clientOptionsFor(
  owner: string,
  token: string,
  base: RunBaseline,
  options: GithubAgentOptions,
  signal: AbortSignal | undefined,
): { readonly owner: string; readonly client: GithubClientOptions } {
  const client: GithubClientOptions = {
    token,
    baseUrl: base.backend.baseUrl,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.topRepoCap !== undefined ? { topRepoCap: options.topRepoCap } : {}),
    ...(options.readmeBytesThreshold !== undefined
      ? { readmeBytesThreshold: options.readmeBytesThreshold }
      : {}),
    ...(signal ? { signal } : {}),
  };
  return { owner, client };
}

async function runFetch(
  cache: CacheFn,
  owner: string,
  client: GithubClientOptions,
  base: RunBaseline,
): Promise<AgentResult<GithubFindings>> {
  try {
    const fetched = await cache<GithubFetchResult>(cacheKey(owner), CACHE_TTL.GITHUB, () =>
      fetchGithubP0(owner, client),
    );
    const findings = githubFindingsSchema.parse({
      trust: 'unverified',
      user: fetched.user,
      repos: fetched.repos,
      callBudget: fetched.callBudget,
    });
    // user=null means the owner endpoint returned 404 — the subject
    // claims an owner that doesn't exist. Surface as 'partial' rather
    // than 'ok' so the score formula sees "we tried but got nothing".
    const status: AgentResult<GithubFindings>['status'] = fetched.user === null ? 'partial' : 'ok';
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

export function createGithubAgent(options: GithubAgentOptions = {}): SourceAgent<GithubFindings> {
  const now = options.now ?? nowSecondsDefault;
  const cache: CacheFn = options.cache ?? getOrFetch;
  const baseUrl = options.baseUrl ?? DEFAULT_GITHUB_BASE_URL;

  return {
    id: AGENT_ID,
    version: AGENT_VERSION,
    domain: AGENT_DOMAIN,
    tierApplicability: ['Public', 'Anchored', 'Sealed'],
    schema: githubFindingsSchema,

    async run(input: AgentInput): Promise<AgentResult<GithubFindings>> {
      const declared = input.subject.declaredSources.github;
      const base: RunBaseline = {
        runUuid: input.runUuid,
        startedAt: now(),
        now,
        provenanceInput: {
          namehash: input.subject.namehash,
          owner: declared?.owner ?? null,
        },
        backend: { kind: 'rest-api', baseUrl, version: BACKEND_VERSION },
      };

      if (declared === null) {
        return buildResult(
          base,
          'partial',
          emptyFindings(),
          buildProvenance({ backend: base.backend, input: base.provenanceInput }),
        );
      }
      const token = resolveToken(options.token);
      if (token === null) {
        return buildResult(
          base,
          'error',
          null,
          buildProvenance({
            backend: base.backend,
            input: base.provenanceInput,
            errorMessage: 'github: GITHUB_TOKEN is not set',
          }),
        );
      }
      const { client } = clientOptionsFor(declared.owner, token, base, options, input.signal);
      return runFetch(cache, declared.owner, client, base);
    },
  };
}

export const githubAgentMeta = {
  id: AGENT_ID,
  version: AGENT_VERSION,
  domain: AGENT_DOMAIN,
} as const;
