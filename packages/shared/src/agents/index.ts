import type { z } from 'zod';
import type { SubjectManifest } from '../subject/types';
import type { TierKey } from '../tiers/index';

export type AgentId = string;
export type SemVer = string;
export type SourceDomain = string;

export type BackendDescriptor =
  | { readonly kind: 'rest-api'; readonly baseUrl: string; readonly version: string }
  | { readonly kind: 'cli'; readonly tool: string; readonly version: string }
  | { readonly kind: 'rpc'; readonly chain: string; readonly provider: string }
  | { readonly kind: 'llm'; readonly provider: string; readonly model: string }
  // Synthesised by @veral/authority/analysis/orchestrator when an agent
  // throws or times out before returning. The orchestrator never has
  // access to the agent's own backend descriptor on the failure path,
  // so this variant names the failure shape directly instead of
  // pretending to be a 'cli' tool.
  | {
      readonly kind: 'orchestrator-error';
      readonly agentId: string;
      readonly cause: 'throw' | 'timeout';
    };

export interface AgentInput {
  readonly subject: SubjectManifest;
  readonly runUuid: string;
  // Orchestrator-supplied cancellation. The agent SHOULD pass this
  // through to every fetch / RPC so that a timeout on the
  // orchestrator side cancels in-flight network work instead of
  // letting it run to socket-level timeout.
  readonly signal?: AbortSignal;
}

export interface AgentProvenance {
  readonly backend: BackendDescriptor;
  readonly inputHash: string;
  readonly promptHash?: string;
  readonly modelResponseHash?: string;
  readonly errorMessage?: string;
}

export type AgentStatus = 'ok' | 'partial' | 'error';

export interface AgentResult<TFindings> {
  readonly agentId: AgentId;
  readonly agentVersion: SemVer;
  readonly runUuid: string;
  readonly runStartedAt: number;
  readonly runFinishedAt: number;
  readonly status: AgentStatus;
  readonly findings: TFindings | null;
  readonly provenance: AgentProvenance;
}

export interface SourceAgent<TFindings> {
  readonly id: AgentId;
  readonly version: SemVer;
  readonly domain: SourceDomain;
  readonly tierApplicability: ReadonlyArray<TierKey>;
  readonly schema: z.ZodSchema<TFindings>;
  run(input: AgentInput): Promise<AgentResult<TFindings>>;
}
