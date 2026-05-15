import type { AgentResult } from '../agents/index.js';
import type { SubjectManifest } from '../subject/types.js';
import type { TierKey } from '../tiers/index.js';
import type { EvidenceBundle } from './evidence.js';
import type { IssuanceResult } from './issuance.js';
import type { PaymentVerification } from './payment.js';
import type { ScoreResult } from './score.js';
import type { TierEligibilityResult } from './tier-eligibility.js';

export interface OrchestrationInput {
  readonly requestId: string;
  readonly subject: SubjectManifest;
  readonly tier: TierKey;
  readonly payment: PaymentVerification;
  readonly runUuid: string;
}

export type OrchestrationPhase =
  | 'eligibility'
  | 'manifest_check'
  | 'agents_running'
  | 'agents_threshold'
  | 'scoring'
  | 'bundling'
  | 'issuing'
  | 'completed'
  | 'refused';

export interface OrchestrationRefusal {
  readonly phase: OrchestrationPhase;
  readonly reason: string;
  readonly detail: string;
}

export interface OrchestrationOutputOk {
  readonly ok: true;
  readonly requestId: string;
  readonly phase: 'completed';
  readonly eligibility: TierEligibilityResult;
  readonly agentResults: ReadonlyArray<AgentResult<unknown>>;
  readonly score: ScoreResult;
  readonly bundle: EvidenceBundle;
  readonly issuance: Extract<IssuanceResult, { ok: true }>;
}

export interface OrchestrationOutputRefused {
  readonly ok: false;
  readonly requestId: string;
  readonly phase: Exclude<OrchestrationPhase, 'completed'>;
  readonly refusal: OrchestrationRefusal;
  readonly partialAgentResults: ReadonlyArray<AgentResult<unknown>>;
}

export type OrchestrationOutput = OrchestrationOutputOk | OrchestrationOutputRefused;
