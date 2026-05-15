import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL ??= 'http://kv.test.invalid';
  process.env.KV_REST_API_TOKEN ??= 'kv-test-token';
  process.env.TURSO_DATABASE_URL ??= 'file::memory:';
});

import type { AgentInput, AgentResult, SourceAgent } from '@veral/shared';
import { z } from 'zod';

import {
  AgentRegistry,
  AgentRegistryDuplicateError,
  AgentRegistrySealedError,
  agentRegistry,
} from '../registry.js';

function makeStubAgent<TFindings = unknown>(
  id: string,
  tierApplicability: SourceAgent<TFindings>['tierApplicability'],
): SourceAgent<TFindings> {
  return {
    id,
    version: '1.0.0',
    domain: 'test',
    tierApplicability,
    schema: z.unknown() as unknown as z.ZodSchema<TFindings>,
    async run(input: AgentInput): Promise<AgentResult<TFindings>> {
      return {
        agentId: id,
        agentVersion: '1.0.0',
        runUuid: input.runUuid,
        runStartedAt: 0,
        runFinishedAt: 0,
        status: 'ok',
        findings: null,
        provenance: {
          backend: { kind: 'rest-api', baseUrl: 'http://test', version: '1' },
          inputHash: '0x',
        },
      };
    },
  };
}

describe('AgentRegistry', () => {
  it('register adds the agent and listRegisteredAgents returns it', () => {
    const r = new AgentRegistry();
    const a = makeStubAgent('alpha', ['Public']);
    r.register(a);
    expect(r.listRegisteredAgents()).toEqual([a]);
  });

  it('throws AgentRegistryDuplicateError on duplicate id', () => {
    const r = new AgentRegistry();
    r.register(makeStubAgent('alpha', ['Public']));
    expect(() => r.register(makeStubAgent('alpha', ['Anchored']))).toThrow(
      AgentRegistryDuplicateError,
    );
    expect(r.listRegisteredAgents()).toHaveLength(1);
  });

  it('getAgentsForTier filters by tierApplicability', () => {
    const r = new AgentRegistry();
    const publicOnly = makeStubAgent('p', ['Public']);
    const anchoredOnly = makeStubAgent('a', ['Anchored']);
    const sealedOnly = makeStubAgent('s', ['Sealed']);
    const allTiers = makeStubAgent('x', ['Public', 'Anchored', 'Sealed']);
    r.register(publicOnly);
    r.register(anchoredOnly);
    r.register(sealedOnly);
    r.register(allTiers);

    expect(
      r
        .getAgentsForTier('Public')
        .map((a) => a.id)
        .sort(),
    ).toEqual(['p', 'x']);
    expect(
      r
        .getAgentsForTier('Anchored')
        .map((a) => a.id)
        .sort(),
    ).toEqual(['a', 'x']);
    expect(
      r
        .getAgentsForTier('Sealed')
        .map((a) => a.id)
        .sort(),
    ).toEqual(['s', 'x']);
  });

  it('returns an empty array when no agent applies to a tier', () => {
    const r = new AgentRegistry();
    r.register(makeStubAgent('p', ['Public']));
    expect(r.getAgentsForTier('Sealed')).toEqual([]);
  });

  it('seal() rejects subsequent register calls with AgentRegistrySealedError', () => {
    const r = new AgentRegistry();
    r.register(makeStubAgent('alpha', ['Public']));
    r.seal();
    expect(r.isSealed()).toBe(true);
    expect(() => r.register(makeStubAgent('beta', ['Public']))).toThrow(AgentRegistrySealedError);
  });

  it('listRegisteredAgents preserves insertion order', () => {
    const r = new AgentRegistry();
    const a = makeStubAgent('a', ['Public']);
    const b = makeStubAgent('b', ['Public']);
    const c = makeStubAgent('c', ['Public']);
    r.register(b);
    r.register(c);
    r.register(a);
    expect(r.listRegisteredAgents().map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('agentRegistry singleton', () => {
  it('is sealed at module load', () => {
    expect(agentRegistry.isSealed()).toBe(true);
  });

  it('contains the Sourcify extractor agent from @veral/sources', () => {
    const ids = agentRegistry.listRegisteredAgents().map((a) => a.id);
    expect(ids).toContain('sourcify-extract');
  });

  it('rejects post-load register attempts', () => {
    expect(() => agentRegistry.register(makeStubAgent('runtime-injected', ['Public']))).toThrow(
      AgentRegistrySealedError,
    );
  });

  it('returns the Sourcify agent for every tier (extractors apply to all)', () => {
    for (const tier of ['Public', 'Anchored', 'Sealed'] as const) {
      const ids = agentRegistry.getAgentsForTier(tier).map((a) => a.id);
      expect(ids).toContain('sourcify-extract');
    }
  });
});
