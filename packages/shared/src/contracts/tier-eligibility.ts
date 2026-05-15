import type { SubjectManifest } from '../subject/types.js';
import type { TierKey } from '../tiers/index.js';

export type TierEligibilityReason =
  | 'subject_unknown'
  | 'manifest_signer_unverified'
  | 'manifest_missing'
  | 'declared_sources_below_threshold'
  | 'sanctions_match'
  | 'subject_kind_unsupported_for_tier'
  | 'forensic_input_missing';

export interface TierEligibilityRequirement {
  readonly tier: TierKey;
  readonly minDeclaredSources: number;
  readonly requireManifestSigner: boolean;
  readonly requireSubjectKinds: ReadonlyArray<SubjectManifest['kind']> | null;
}

export interface TierEligibilityPass {
  readonly tier: TierKey;
  readonly ok: true;
  readonly requirement: TierEligibilityRequirement;
  readonly declaredSourceCount: number;
}

export interface TierEligibilityFail {
  readonly tier: TierKey;
  readonly ok: false;
  readonly requirement: TierEligibilityRequirement;
  readonly declaredSourceCount: number;
  readonly reasons: ReadonlyArray<TierEligibilityReason>;
}

export type TierEligibilityResult = TierEligibilityPass | TierEligibilityFail;
