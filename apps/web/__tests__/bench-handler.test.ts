import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL ??= 'http://kv.test.invalid';
  process.env.KV_REST_API_TOKEN ??= 'kv-test-token';
  process.env.TURSO_DATABASE_URL ??= 'file::memory:';
});

import type { AgentResult, AgentStatus, SubjectManifest } from '@veral/shared';
import { SubjectResolutionError, SubjectResolverConfigError, VeralError } from '@veral/shared';

import { BenchHandlerError, computeBenchScore } from '../lib/bench-handler.js';
import {
  ENS_AGENT_ID,
  ETHEREUM_AGENT_ID,
  GITHUB_AGENT_ID,
  SOURCIFY_AGENT_ID,
} from '../lib/score-adapter.js';

const SUBJECT_NAMEHASH = `0x${'a'.repeat(64)}` as `0x${string}`;
const SUBJECT_ADDRESS = `0x${'d'.repeat(40)}` as `0x${string}`;
const NOW = 1_700_000_000;
const RUN_UUID = '11111111-1111-1111-1111-111111111111';

function fakeSubject(): SubjectManifest {
  return {
    ensName: 'alice.eth',
    namehash: SUBJECT_NAMEHASH,
    primaryAddress: SUBJECT_ADDRESS,
    kind: 'project',
    declaredSources: {
      sourcify: [],
      github: null,
      onchain: null,
      ensInternal: { rootName: 'eth' },
    },
  };
}

function okSourcifyResult(): AgentResult<unknown> {
  return {
    agentId: SOURCIFY_AGENT_ID,
    agentVersion: '1.0.0',
    runUuid: RUN_UUID,
    runStartedAt: NOW - 1,
    runFinishedAt: NOW,
    status: 'ok',
    findings: {
      trust: 'verified',
      contracts: [
        {
          chainId: 1,
          address: SUBJECT_ADDRESS,
          match: 'exact_match',
          compilerVersion: '0.8.20',
          language: 'Solidity',
          contractName: 'AliceContract',
        },
      ],
      verifiedCount: 1,
      partialCount: 0,
      notFoundCount: 0,
    },
    provenance: {
      backend: { kind: 'rest-api', baseUrl: 'http://sourcify.test', version: '2' },
      inputHash: '0x',
    },
  };
}

function bareResult(agentId: string, status: AgentStatus): AgentResult<unknown> {
  return {
    agentId,
    agentVersion: '1.0.0',
    runUuid: RUN_UUID,
    runStartedAt: NOW - 1,
    runFinishedAt: NOW,
    status,
    findings: null,
    provenance: {
      backend: { kind: 'rest-api', baseUrl: 'http://test', version: '1' },
      inputHash: '0x',
    },
  };
}

describe('computeBenchScore', () => {
  it('returns a BenchScoreResult composed from resolveSubject + orchestrate + score engine', async () => {
    const resolveSubject = vi.fn(async () => fakeSubject());
    const orchestrate = vi.fn(async () => ({
      runUuid: RUN_UUID,
      tier: 'Public' as const,
      agentResults: [okSourcifyResult()],
      agentsTotal: 1,
      agentsSucceeded: 1,
      startedAt: NOW - 1,
      finishedAt: NOW,
    }));

    const result = await computeBenchScore('alice.eth', {
      resolveSubject,
      orchestrate,
      now: () => NOW,
      runUuid: () => RUN_UUID,
    });

    expect(result.score.subjectNamehash).toBe(SUBJECT_NAMEHASH);
    expect(result.score.tier).toBe('Public');
    expect(result.score.formulaVersion).toBe('v1.0.0');
    expect(result.score.computedAt).toBe(NOW);
    expect(result.score.components.length).toBeGreaterThan(0);
    // Verified Sourcify entry contributes to sourcifyRecency only —
    // compileSuccess sits behind a function-signature complexity gate
    // and the agent does not surface signatures yet, so it returns null.
    expect(result.score.score).toBeGreaterThan(0);
    expect(result.agentRollup).toHaveLength(1);
    expect(result.agentRollup[0]).toEqual({
      agentId: SOURCIFY_AGENT_ID,
      domain: 'sourcify',
      status: 'ok',
    });
    expect(resolveSubject).toHaveBeenCalledWith('alice.eth');
    expect(orchestrate).toHaveBeenCalledTimes(1);
  });

  it('maps an ok/partial/error mix into the rollup with the correct domains', async () => {
    const agentResults: ReadonlyArray<AgentResult<unknown>> = [
      okSourcifyResult(),
      bareResult(GITHUB_AGENT_ID, 'partial'),
      bareResult(ETHEREUM_AGENT_ID, 'error'),
    ];
    const result = await computeBenchScore('alice.eth', {
      resolveSubject: async () => fakeSubject(),
      orchestrate: async () => ({
        runUuid: RUN_UUID,
        tier: 'Public' as const,
        agentResults,
        agentsTotal: 3,
        agentsSucceeded: 1,
        startedAt: NOW - 1,
        finishedAt: NOW,
      }),
      now: () => NOW,
    });
    expect(result.agentRollup).toEqual([
      { agentId: SOURCIFY_AGENT_ID, domain: 'sourcify', status: 'ok' },
      { agentId: GITHUB_AGENT_ID, domain: 'github', status: 'partial' },
      { agentId: ETHEREUM_AGENT_ID, domain: 'ethereum', status: 'error' },
    ]);
  });

  it('rollup mirrors the orchestrator agent-results order (registry insertion order)', async () => {
    const ordered: ReadonlyArray<AgentResult<unknown>> = [
      bareResult(ETHEREUM_AGENT_ID, 'ok'),
      bareResult(SOURCIFY_AGENT_ID, 'ok'),
      bareResult(GITHUB_AGENT_ID, 'ok'),
    ];
    const result = await computeBenchScore('alice.eth', {
      resolveSubject: async () => fakeSubject(),
      orchestrate: async () => ({
        runUuid: RUN_UUID,
        tier: 'Public' as const,
        agentResults: ordered,
        agentsTotal: 3,
        agentsSucceeded: 3,
        startedAt: NOW,
        finishedAt: NOW,
      }),
      now: () => NOW,
    });
    expect(result.agentRollup.map((r) => r.agentId)).toEqual([
      ETHEREUM_AGENT_ID,
      SOURCIFY_AGENT_ID,
      GITHUB_AGENT_ID,
    ]);
  });

  it('falls back to agentId-as-domain for an unknown agent id', async () => {
    const result = await computeBenchScore('alice.eth', {
      resolveSubject: async () => fakeSubject(),
      orchestrate: async () => ({
        runUuid: RUN_UUID,
        tier: 'Public' as const,
        agentResults: [bareResult('future-extract', 'ok')],
        agentsTotal: 1,
        agentsSucceeded: 1,
        startedAt: NOW,
        finishedAt: NOW,
      }),
      now: () => NOW,
    });
    expect(result.agentRollup[0]).toEqual({
      agentId: 'future-extract',
      domain: 'future-extract',
      status: 'ok',
    });
  });

  it('empty agentResults → empty rollup, zero score', async () => {
    const result = await computeBenchScore('alice.eth', {
      resolveSubject: async () => fakeSubject(),
      orchestrate: async () => ({
        runUuid: RUN_UUID,
        tier: 'Public' as const,
        agentResults: [],
        agentsTotal: 0,
        agentsSucceeded: 0,
        startedAt: NOW,
        finishedAt: NOW,
      }),
      now: () => NOW,
    });
    expect(result.agentRollup).toEqual([]);
    expect(result.score.score).toBe(0);
  });

  it('rejects malformed ENS names with 400 BAD_REQUEST', async () => {
    await expect(computeBenchScore('not a name')).rejects.toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
    });
    await expect(computeBenchScore('')).rejects.toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
    });
  });

  it('translates SubjectResolutionError into 404 NOT_FOUND', async () => {
    await expect(
      computeBenchScore('alice.eth', {
        resolveSubject: async () => {
          throw new SubjectResolutionError('ENS name not registered');
        },
        orchestrate: async () => {
          throw new Error('should not be called');
        },
      }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('translates SubjectResolverConfigError into 503 SERVICE_UNAVAILABLE', async () => {
    await expect(
      computeBenchScore('alice.eth', {
        resolveSubject: async () => {
          throw new SubjectResolverConfigError('ALCHEMY_RPC_URL_MAINNET is not set');
        },
        orchestrate: async () => {
          throw new Error('should not be called');
        },
      }),
    ).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  });

  it('translates other VeralError from resolver into 502 BAD_GATEWAY', async () => {
    class UpstreamError extends VeralError {
      constructor(message: string) {
        super('UPSTREAM', message);
        this.name = 'UpstreamError';
      }
    }
    await expect(
      computeBenchScore('alice.eth', {
        resolveSubject: async () => {
          throw new UpstreamError('ENS subgraph 503');
        },
        orchestrate: async () => {
          throw new Error('should not be called');
        },
      }),
    ).rejects.toMatchObject({ status: 502, code: 'BAD_GATEWAY' });
  });

  it('translates unknown resolver errors into 500 INTERNAL', async () => {
    await expect(
      computeBenchScore('alice.eth', {
        resolveSubject: async () => {
          throw new TypeError('boom');
        },
        orchestrate: async () => {
          throw new Error('should not be called');
        },
      }),
    ).rejects.toMatchObject({ status: 500, code: 'INTERNAL' });
  });

  it('translates orchestrator throws into 502 BAD_GATEWAY', async () => {
    await expect(
      computeBenchScore('alice.eth', {
        resolveSubject: async () => fakeSubject(),
        orchestrate: async () => {
          throw new Error('registry sealed');
        },
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ status: 502, code: 'BAD_GATEWAY' });
  });

  it('normalises uppercase ENS names', async () => {
    const resolveSubject = vi.fn(async () => fakeSubject());
    await computeBenchScore('ALICE.ETH', {
      resolveSubject,
      orchestrate: async () => ({
        runUuid: RUN_UUID,
        tier: 'Public' as const,
        agentResults: [],
        agentsTotal: 0,
        agentsSucceeded: 0,
        startedAt: NOW,
        finishedAt: NOW,
      }),
      now: () => NOW,
    });
    expect(resolveSubject).toHaveBeenCalledWith('alice.eth');
  });
});

describe('BenchHandlerError', () => {
  it('carries status + code + message', () => {
    const e = new BenchHandlerError(418, 'BAD_REQUEST', 'I am a teapot');
    expect(e.status).toBe(418);
    expect(e.code).toBe('BAD_REQUEST');
    expect(e.message).toBe('I am a teapot');
    expect(e).toBeInstanceOf(Error);
  });
});

describe('AGENT_DOMAIN_BY_ID lookup', () => {
  it('maps ens-extract to ens-internal in the rollup', async () => {
    const result = await computeBenchScore('alice.eth', {
      resolveSubject: async () => fakeSubject(),
      orchestrate: async () => ({
        runUuid: RUN_UUID,
        tier: 'Public' as const,
        agentResults: [bareResult(ENS_AGENT_ID, 'ok')],
        agentsTotal: 1,
        agentsSucceeded: 1,
        startedAt: NOW,
        finishedAt: NOW,
      }),
      now: () => NOW,
    });
    expect(result.agentRollup[0]).toEqual({
      agentId: ENS_AGENT_ID,
      domain: 'ens-internal',
      status: 'ok',
    });
  });

  it('maps eas-extract to eas in the rollup', async () => {
    const result = await computeBenchScore('alice.eth', {
      resolveSubject: async () => fakeSubject(),
      orchestrate: async () => ({
        runUuid: RUN_UUID,
        tier: 'Public' as const,
        agentResults: [bareResult('eas-extract', 'ok')],
        agentsTotal: 1,
        agentsSucceeded: 1,
        startedAt: NOW,
        finishedAt: NOW,
      }),
      now: () => NOW,
    });
    expect(result.agentRollup[0]).toEqual({
      agentId: 'eas-extract',
      domain: 'eas',
      status: 'ok',
    });
  });

  it('rollup mirrors registry insertion order across all five agents', async () => {
    const result = await computeBenchScore('alice.eth', {
      resolveSubject: async () => fakeSubject(),
      orchestrate: async () => ({
        runUuid: RUN_UUID,
        tier: 'Public' as const,
        agentResults: [
          bareResult(SOURCIFY_AGENT_ID, 'ok'),
          bareResult(GITHUB_AGENT_ID, 'ok'),
          bareResult(ETHEREUM_AGENT_ID, 'ok'),
          bareResult(ENS_AGENT_ID, 'ok'),
          bareResult('eas-extract', 'ok'),
        ],
        agentsTotal: 5,
        agentsSucceeded: 5,
        startedAt: NOW,
        finishedAt: NOW,
      }),
      now: () => NOW,
    });
    expect(result.agentRollup.map((r) => r.domain)).toEqual([
      'sourcify',
      'github',
      'ethereum',
      'ens-internal',
      'eas',
    ]);
  });
});
