import type { AgentId, SourceAgent, TierKey } from '@veral/shared';
import { VeralError } from '@veral/shared';
import { createExtractorRegistry } from '@veral/sources';

export class AgentRegistryDuplicateError extends VeralError {
  readonly agentId: AgentId;
  constructor(agentId: AgentId) {
    super('AGENT_REGISTRY_DUPLICATE', `agent "${agentId}" is already registered`);
    this.name = 'AgentRegistryDuplicateError';
    this.agentId = agentId;
  }
}

export class AgentRegistrySealedError extends VeralError {
  readonly agentId: AgentId;
  constructor(agentId: AgentId) {
    super(
      'AGENT_REGISTRY_SEALED',
      `cannot register agent "${agentId}" — registry is sealed (registration is module-load only)`,
    );
    this.name = 'AgentRegistrySealedError';
    this.agentId = agentId;
  }
}

// One registry per process. Runtime registration after `seal()` is rejected so
// late-binding plugins cannot quietly change the orchestrator's agent set —
// every agent the authority can run must be visible at module-load time for
// the lint rule (CLAUDE.md rule 1) and ADR-004 invariant to hold.
export class AgentRegistry {
  private readonly agents = new Map<AgentId, SourceAgent<unknown>>();
  private sealed = false;

  register(agent: SourceAgent<unknown>): void {
    if (this.sealed) throw new AgentRegistrySealedError(agent.id);
    if (this.agents.has(agent.id)) throw new AgentRegistryDuplicateError(agent.id);
    this.agents.set(agent.id, agent);
  }

  seal(): void {
    this.sealed = true;
  }

  isSealed(): boolean {
    return this.sealed;
  }

  getAgentsForTier(tier: TierKey): ReadonlyArray<SourceAgent<unknown>> {
    const out: SourceAgent<unknown>[] = [];
    for (const agent of this.agents.values()) {
      if (agent.tierApplicability.includes(tier)) out.push(agent);
    }
    return out;
  }

  listRegisteredAgents(): ReadonlyArray<SourceAgent<unknown>> {
    return [...this.agents.values()];
  }
}

function buildSingleton(): AgentRegistry {
  const r = new AgentRegistry();
  for (const agent of createExtractorRegistry()) r.register(agent);
  r.seal();
  return r;
}

export const agentRegistry: AgentRegistry = buildSingleton();
