import type {
  AgentInput,
  AgentResult,
  BackendDescriptor,
  SourceAgent,
  SubjectManifest,
  TierKey,
} from '@veral/shared';
import { buildProvenance } from '@veral/shared';

import { type AgentRegistry, agentRegistry as defaultRegistry } from './registry.js';

export const DEFAULT_AGENT_TIMEOUT_MS = 30_000;

export interface OrchestrateInput {
  readonly subject: SubjectManifest;
  readonly tier: TierKey;
  readonly runUuid: string;
  // Per-agent wall-clock cap. One slow agent must not stall the
  // certificate request, so each run gets an independent timer.
  readonly timeoutMs?: number;
  // Injectable for tests; production callers omit and inherit the
  // module-load sealed singleton.
  readonly registry?: AgentRegistry;
  // Override the clock for deterministic tests. Returns Unix seconds.
  readonly now?: () => number;
}

export interface OrchestrateOutput {
  readonly runUuid: string;
  readonly tier: TierKey;
  readonly agentResults: ReadonlyArray<AgentResult<unknown>>;
  readonly agentsTotal: number;
  readonly agentsSucceeded: number;
  readonly startedAt: number;
  readonly finishedAt: number;
}

function nowSecondsDefault(): number {
  return Math.floor(Date.now() / 1000);
}

// We do not have access to the agent's own backend descriptor when the
// agent throws or times out before returning, so we surface the
// orchestrator as the backend with a per-agent tool label. The
// errorMessage on the provenance is the load-bearing field.
function orchestratorBackend(agentId: string): BackendDescriptor {
  return { kind: 'cli', tool: `veral-orchestrator:${agentId}`, version: '1' };
}

function buildErrorResult(
  agent: SourceAgent<unknown>,
  input: AgentInput,
  runStartedAt: number,
  runFinishedAt: number,
  errorMessage: string,
): AgentResult<unknown> {
  return {
    agentId: agent.id,
    agentVersion: agent.version,
    runUuid: input.runUuid,
    runStartedAt,
    runFinishedAt,
    status: 'error',
    findings: null,
    provenance: buildProvenance({
      backend: orchestratorBackend(agent.id),
      input: { subject: input.subject, runUuid: input.runUuid },
      errorMessage,
    }),
  };
}

async function runWithTimeout(
  agent: SourceAgent<unknown>,
  input: AgentInput,
  timeoutMs: number,
  now: () => number,
): Promise<AgentResult<unknown>> {
  const runStartedAt = now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`agent "${agent.id}" timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([agent.run(input), timeoutPromise]);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return buildErrorResult(agent, input, runStartedAt, now(), errorMessage);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function orchestrate(input: OrchestrateInput): Promise<OrchestrateOutput> {
  const registry = input.registry ?? defaultRegistry;
  const timeoutMs = input.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  const now = input.now ?? nowSecondsDefault;
  const startedAt = now();

  const agents = registry.getAgentsForTier(input.tier);
  const agentInput: AgentInput = {
    subject: input.subject,
    runUuid: input.runUuid,
  };

  // Promise.all over runWithTimeout — never throws because every branch
  // resolves to an AgentResult (success, agent-level error, or
  // orchestrator-built error). Order matches getAgentsForTier order,
  // which itself preserves registry insertion order.
  const agentResults = await Promise.all(
    agents.map((agent) => runWithTimeout(agent, agentInput, timeoutMs, now)),
  );

  let succeeded = 0;
  for (const r of agentResults) {
    if (r.status === 'ok') succeeded += 1;
  }

  return {
    runUuid: input.runUuid,
    tier: input.tier,
    agentResults,
    agentsTotal: agents.length,
    agentsSucceeded: succeeded,
    startedAt,
    finishedAt: now(),
  };
}
