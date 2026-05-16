import type {
  SubjectManifest,
  TierEligibilityReason,
  TierEligibilityRequirement,
  TierEligibilityResult,
} from '@veral/shared';

// Methodology depth (Q1 lock + ADR-001): Anchored adds AI feasibility on
// top of Public. The manifest signer (EIP-712 over ENS owner) is
// REQUIRED so AI-augmented decisions are bound to an attestable owner.
export const ANCHORED_TIER_REQUIREMENT: TierEligibilityRequirement = {
  tier: 'Anchored',
  minDeclaredSources: 12,
  requireManifestSigner: true,
  requireSubjectKinds: null,
};

export function evaluateAnchoredTier(
  subject: SubjectManifest,
  declaredSourceCount: number,
  manifestVerified: boolean,
): TierEligibilityResult {
  const reasons: TierEligibilityReason[] = [];
  if (subject.kind === 'unknown') reasons.push('subject_unknown');
  if (declaredSourceCount < ANCHORED_TIER_REQUIREMENT.minDeclaredSources) {
    reasons.push('declared_sources_below_threshold');
  }
  if (!manifestVerified) reasons.push('manifest_signer_unverified');
  if (reasons.length > 0) {
    return {
      tier: 'Anchored',
      ok: false,
      requirement: ANCHORED_TIER_REQUIREMENT,
      declaredSourceCount,
      reasons,
    };
  }
  return {
    tier: 'Anchored',
    ok: true,
    requirement: ANCHORED_TIER_REQUIREMENT,
    declaredSourceCount,
  };
}
