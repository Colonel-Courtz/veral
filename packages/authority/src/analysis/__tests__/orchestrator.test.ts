import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL ??= 'http://kv.test.invalid';
  process.env.KV_REST_API_TOKEN ??= 'kv-test-token';
  process.env.TURSO_DATABASE_URL ??= 'file::memory:';
});

import type {
  AgentInput,
  AgentResult,
  AgentStatus,
  SourceAgent,
  SubjectManifest,
  TierKey,
} from '@veral/shared';
import { z } from 'zod';
import { DEFAULT_AGENT_TIMEOUT_MS, orchestrate } from '../orchestrator';
import { AgentRegistry } from '../registry';

const SUBJECT: SubjectManifest = {
  ensName: 'alice.eth',
  namehash: `0x${'a'.repeat(64)}` as `0x${string}`,
  primaryAddress: null,
  kind: 'project',
  declaredSources: {
    sourcify: [],
    github: null,
    onchain: null,
    ensInternal: { rootName: 'eth' },
  },
};

interface StubAgentOptions {
  readonly id: string;
  readonly tiers?: ReadonlyArray<TierKey>;
  readonly status?: AgentStatus;
  readonly delayMs?: number;
  readonly throws?: Error;
}

function stubAgent(opts: StubAgentOptions): SourceAgent<unknown> {
  return {
    id: opts.id,
    version: '1.0.0',
    domain: 'test',
    tierApplicability: opts.tiers ?? ['Public', 'Anchored', 'Sealed'],
    schema: z.unknown() as z.ZodSchema<unknown>,
    async run(input: AgentInput): Promise<AgentResult<unknown>> {
      if (opts.delayMs && opts.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
      }
      if (opts.throws) throw opts.throws;
      return {
        agentId: opts.id,
        agentVersion: '1.0.0',
        runUuid: input.runUuid,
        runStartedAt: 100,
        runFinishedAt: 101,
        status: opts.status ?? 'ok',
        findings: opts.status === 'error' ? null : { ok: true },
        provenance: {
          backend: { kind: 'rest-api', baseUrl: 'http://test', version: '1' },
          inputHash: '0x',
        },
      };
    },
  };
}

function registryWith(agents: ReadonlyArray<SourceAgent<unknown>>): AgentRegistry {
  const r = new AgentRegistry();
  for (const a of agents) r.register(a);
  r.seal();
  return r;
}

function baseInput(overrides: Partial<Parameters<typeof orchestrate>[0]> = {}) {
  return {
    subject: SUBJECT,
    tier: 'Public' as TierKey,
    runUuid: 'run-1',
    now: () => 1000,
    ...overrides,
  };
}

describe('orchestrate', () => {
  it('runs all applicable agents in parallel and aggregates results', async () => {
    const registry = registryWith([
      stubAgent({ id: 'a' }),
      stubAgent({ id: 'b' }),
      stubAgent({ id: 'c' }),
    ]);

    const out = await orchestrate(baseInput({ registry }));

    expect(out.agentResults.map((r) => r.agentId)).toEqual(['a', 'b', 'c']);
    expect(out.agentsTotal).toBe(3);
    expect(out.agentsSucceeded).toBe(3);
    expect(out.runUuid).toBe('run-1');
    expect(out.tier).toBe('Public');
  });

  it('preserves agent ordering matching registry insertion order', async () => {
    const registry = registryWith([
      stubAgent({ id: 'beta' }),
      stubAgent({ id: 'alpha' }),
      stubAgent({ id: 'gamma' }),
    ]);
    const out = await orchestrate(baseInput({ registry }));
    expect(out.agentResults.map((r) => r.agentId)).toEqual(['beta', 'alpha', 'gamma']);
  });

  it('filters agents by tier', async () => {
    const registry = registryWith([
      stubAgent({ id: 'pub', tiers: ['Public'] }),
      stubAgent({ id: 'sealed', tiers: ['Sealed'] }),
    ]);
    const out = await orchestrate(baseInput({ registry, tier: 'Public' }));
    expect(out.agentResults.map((r) => r.agentId)).toEqual(['pub']);
    expect(out.agentsTotal).toBe(1);
  });

  it('returns an empty result set when no agent applies', async () => {
    const registry = registryWith([stubAgent({ id: 'pub', tiers: ['Public'] })]);
    const out = await orchestrate(baseInput({ registry, tier: 'Sealed' }));
    expect(out.agentResults).toEqual([]);
    expect(out.agentsTotal).toBe(0);
    expect(out.agentsSucceeded).toBe(0);
  });

  it('isolates agent throws — one failure does not abort the batch', async () => {
    const registry = registryWith([
      stubAgent({ id: 'good' }),
      stubAgent({ id: 'bad', throws: new Error('boom') }),
      stubAgent({ id: 'also-good' }),
    ]);
    const out = await orchestrate(baseInput({ registry }));

    expect(out.agentResults).toHaveLength(3);
    expect(out.agentsSucceeded).toBe(2);
    const bad = out.agentResults.find((r) => r.agentId === 'bad');
    expect(bad?.status).toBe('error');
    expect(bad?.findings).toBeNull();
    expect(bad?.provenance.errorMessage).toBe('boom');
    expect(bad?.provenance.backend).toEqual({
      kind: 'orchestrator-error',
      agentId: 'bad',
      cause: 'throw',
    });
    expect(bad?.provenance.backend.kind).toBe('orchestrator-error');
  });

  it('times out a slow agent without blocking faster siblings', async () => {
    const registry = registryWith([
      stubAgent({ id: 'fast' }),
      stubAgent({ id: 'slow', delayMs: 1000 }),
    ]);
    const out = await orchestrate(baseInput({ registry, timeoutMs: 30 }));

    expect(out.agentsSucceeded).toBe(1);
    const slow = out.agentResults.find((r) => r.agentId === 'slow');
    expect(slow?.status).toBe('error');
    expect(slow?.provenance.errorMessage).toMatch(/timed out after 30ms/);
    expect(slow?.provenance.backend).toEqual({
      kind: 'orchestrator-error',
      agentId: 'slow',
      cause: 'timeout',
    });
    expect(slow?.provenance.backend.kind).toBe('orchestrator-error');
    const fast = out.agentResults.find((r) => r.agentId === 'fast');
    expect(fast?.status).toBe('ok');
    // Happy-path agents keep their own backend descriptor — the
    // orchestrator-error variant is reserved for failure paths.
    expect(fast?.provenance.backend.kind).toBe('rest-api');
  });

  it('falls back to the default timeout when none supplied', async () => {
    expect(DEFAULT_AGENT_TIMEOUT_MS).toBe(30_000);
    const registry = registryWith([stubAgent({ id: 'a' })]);
    const out = await orchestrate(baseInput({ registry }));
    expect(out.agentResults).toHaveLength(1);
  });

  it('echoes runUuid and tier through the output', async () => {
    const registry = registryWith([stubAgent({ id: 'a' })]);
    const out = await orchestrate(
      baseInput({ registry, runUuid: 'custom-uuid', tier: 'Anchored' }),
    );
    expect(out.runUuid).toBe('custom-uuid');
    expect(out.tier).toBe('Anchored');
    expect(out.agentResults[0]?.runUuid).toBe('custom-uuid');
  });

  it('counts agent-returned status="error" results in agentsTotal but not agentsSucceeded', async () => {
    const registry = registryWith([
      stubAgent({ id: 'ok-agent' }),
      stubAgent({ id: 'agent-soft-error', status: 'error' }),
    ]);
    const out = await orchestrate(baseInput({ registry }));
    expect(out.agentsTotal).toBe(2);
    expect(out.agentsSucceeded).toBe(1);
  });

  it('runs concurrently — total wall time tracks the slowest agent, not the sum', async () => {
    const registry = registryWith([
      stubAgent({ id: 'a', delayMs: 40 }),
      stubAgent({ id: 'b', delayMs: 40 }),
      stubAgent({ id: 'c', delayMs: 40 }),
    ]);
    const t0 = Date.now();
    await orchestrate(baseInput({ registry, timeoutMs: 500 }));
    const elapsed = Date.now() - t0;
    // 3 sequential 40ms agents would take ~120ms. Parallel should be ~40ms +
    // overhead. A 100ms ceiling proves concurrency without being flaky.
    expect(elapsed).toBeLessThan(100);
  });
});
