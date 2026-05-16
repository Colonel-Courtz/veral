import type {
  AgentInput,
  AgentResult,
  BackendDescriptor,
  SourceAgent,
  SubjectManifest,
  TierKey,
} from '@veral/shared';
import { buildProvenance } from '@veral/shared';

import { type AgentRegistry, agentRegistry as defaultRegistry } from './registry';

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

// Sentinel error class so the catch branch can distinguish a timeout
// (orchestrator-side deadline) from an agent throw (agent-side failure)
// without relying on a message-substring match.
class AgentTimeoutError extends Error {
  readonly agentId: string;
  readonly timeoutMs: number;
  constructor(agentId: string, timeoutMs: number) {
    super(`agent "${agentId}" timed out after ${timeoutMs}ms`);
    this.name = 'AgentTimeoutError';
    this.agentId = agentId;
    this.timeoutMs = timeoutMs;
  }
}

function nowSecondsDefault(): number {
  return Math.floor(Date.now() / 1000);
}

function orchestratorBackend(agentId: string, cause: 'throw' | 'timeout'): BackendDescriptor {
  return { kind: 'orchestrator-error', agentId, cause };
}

function buildErrorResult(
  agent: SourceAgent<unknown>,
  input: AgentInput,
  runStartedAt: number,
  runFinishedAt: number,
  errorMessage: string,
  cause: 'throw' | 'timeout',
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
      backend: orchestratorBackend(agent.id, cause),
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
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Abort BEFORE rejecting so the agent's in-flight fetch
      // observes the abort and tears down its socket. The race
      // settles on the timeout-error path either way.
      controller.abort();
      reject(new AgentTimeoutError(agent.id, timeoutMs));
    }, timeoutMs);
  });

  const agentPromise = agent.run({ ...input, signal: controller.signal });
  // Attach a no-op rejection handler so Node does not warn if the
  // race winner is the timeout and the agent's promise settles
  // late with an abort-induced rejection. Promise.race below still
  // observes the rejection independently.
  agentPromise.catch(() => undefined);

  try {
    return await Promise.race([agentPromise, timeoutPromise]);
  } catch (err) {
    const cause: 'throw' | 'timeout' = err instanceof AgentTimeoutError ? 'timeout' : 'throw';
    const errorMessage = err instanceof Error ? err.message : String(err);
    return buildErrorResult(agent, input, runStartedAt, now(), errorMessage, cause);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // Defensive: release any background work the agent might still
    // hold open even on success/throw. No-op when already aborted.
    if (!controller.signal.aborted) controller.abort();
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
