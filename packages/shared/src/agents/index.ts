import type { z } from 'zod';
import type { TierKey } from '../tiers/index.js';
import type { SubjectManifest } from '../subject/types.js';

export type AgentId = string;
export type SemVer = string;
export type SourceDomain = string;

export type BackendDescriptor =
  | { readonly kind: 'rest-api'; readonly baseUrl: string; readonly version: string }
  | { readonly kind: 'cli'; readonly tool: string; readonly version: string }
  | { readonly kind: 'rpc'; readonly chain: string; readonly provider: string }
  | { readonly kind: 'llm'; readonly provider: string; readonly model: string };

export interface AgentInput {
  readonly subject: SubjectManifest;
  readonly runUuid: string;
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
