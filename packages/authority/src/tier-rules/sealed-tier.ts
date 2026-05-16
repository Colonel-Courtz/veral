import type {
  SubjectManifest,
  TierEligibilityReason,
  TierEligibilityRequirement,
  TierEligibilityResult,
} from '@veral/shared';

// Methodology depth (Q1 lock + ADR-001): Sealed adds forensic audit on
// top of Anchored. Manifest signer REQUIRED, forensic input fields
// REQUIRED (corporate, financial, regulatory evidence).
export const SEALED_TIER_REQUIREMENT: TierEligibilityRequirement = {
  tier: 'Sealed',
  minDeclaredSources: 18,
  requireManifestSigner: true,
  requireSubjectKinds: null,
};

export function evaluateSealedTier(
  subject: SubjectManifest,
  declaredSourceCount: number,
  manifestVerified: boolean,
  forensicInputsPresent: boolean,
): TierEligibilityResult {
  const reasons: TierEligibilityReason[] = [];
  if (subject.kind === 'unknown') reasons.push('subject_unknown');
  if (declaredSourceCount < SEALED_TIER_REQUIREMENT.minDeclaredSources) {
    reasons.push('declared_sources_below_threshold');
  }
  if (!manifestVerified) reasons.push('manifest_signer_unverified');
  if (!forensicInputsPresent) reasons.push('forensic_input_missing');
  if (reasons.length > 0) {
    return {
      tier: 'Sealed',
      ok: false,
      requirement: SEALED_TIER_REQUIREMENT,
      declaredSourceCount,
      reasons,
    };
  }
  return {
    tier: 'Sealed',
    ok: true,
    requirement: SEALED_TIER_REQUIREMENT,
    declaredSourceCount,
  };
}
