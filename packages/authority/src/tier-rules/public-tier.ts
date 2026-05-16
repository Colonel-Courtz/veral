import type {
  SubjectManifest,
  TierEligibilityReason,
  TierEligibilityRequirement,
  TierEligibilityResult,
} from '@veral/shared';

// Methodology depth (Q1 lock + ADR-001): Public is deterministic-only —
// no AI, no forensic input. Public-read fallback is allowed, so the
// manifest signer is not required.
export const PUBLIC_TIER_REQUIREMENT: TierEligibilityRequirement = {
  tier: 'Public',
  minDeclaredSources: 4,
  requireManifestSigner: false,
  requireSubjectKinds: null,
};

export function evaluatePublicTier(
  subject: SubjectManifest,
  declaredSourceCount: number,
): TierEligibilityResult {
  const reasons: TierEligibilityReason[] = [];
  if (subject.kind === 'unknown') reasons.push('subject_unknown');
  if (declaredSourceCount < PUBLIC_TIER_REQUIREMENT.minDeclaredSources) {
    reasons.push('declared_sources_below_threshold');
  }
  if (reasons.length > 0) {
    return {
      tier: 'Public',
      ok: false,
      requirement: PUBLIC_TIER_REQUIREMENT,
      declaredSourceCount,
      reasons,
    };
  }
  return {
    tier: 'Public',
    ok: true,
    requirement: PUBLIC_TIER_REQUIREMENT,
    declaredSourceCount,
  };
}
