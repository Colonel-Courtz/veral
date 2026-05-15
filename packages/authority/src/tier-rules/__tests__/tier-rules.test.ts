import type { SubjectKind, SubjectManifest } from '@veral/shared';
import { describe, expect, it } from 'vitest';

import { ANCHORED_TIER_REQUIREMENT, evaluateAnchoredTier } from '../anchored-tier.js';
import { evaluatePublicTier, PUBLIC_TIER_REQUIREMENT } from '../public-tier.js';
import { evaluateSealedTier, SEALED_TIER_REQUIREMENT } from '../sealed-tier.js';

function subject(kind: SubjectKind = 'project'): SubjectManifest {
  return {
    ensName: 'alice.eth',
    namehash: `0x${'a'.repeat(64)}` as `0x${string}`,
    primaryAddress: null,
    kind,
    declaredSources: {
      sourcify: [],
      github: null,
      onchain: null,
      ensInternal: { rootName: 'eth' },
    },
  };
}

describe('evaluatePublicTier', () => {
  it('passes when count meets the 4-source threshold and subject is known', () => {
    const result = evaluatePublicTier(subject(), 4);
    expect(result.ok).toBe(true);
    expect(result.tier).toBe('Public');
    expect(result.requirement).toEqual(PUBLIC_TIER_REQUIREMENT);
    expect(result.declaredSourceCount).toBe(4);
  });

  it('fails with declared_sources_below_threshold when count < 4', () => {
    const result = evaluatePublicTier(subject(), 3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toEqual(['declared_sources_below_threshold']);
    }
  });

  it('fails with subject_unknown when kind is unknown', () => {
    const result = evaluatePublicTier(subject('unknown'), 10);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toEqual(['subject_unknown']);
    }
  });

  it('does not require manifest signer (public-read fallback allowed)', () => {
    expect(PUBLIC_TIER_REQUIREMENT.requireManifestSigner).toBe(false);
  });

  it('aggregates multiple applicable reasons in a single fail', () => {
    const result = evaluatePublicTier(subject('unknown'), 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toEqual(['subject_unknown', 'declared_sources_below_threshold']);
    }
  });
});

describe('evaluateAnchoredTier', () => {
  it('passes when count >= 12 and manifest is signer-verified', () => {
    const result = evaluateAnchoredTier(subject(), 12, true);
    expect(result.ok).toBe(true);
    expect(result.tier).toBe('Anchored');
    expect(result.requirement).toEqual(ANCHORED_TIER_REQUIREMENT);
  });

  it('fails with declared_sources_below_threshold when count < 12', () => {
    const result = evaluateAnchoredTier(subject(), 11, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toEqual(['declared_sources_below_threshold']);
    }
  });

  it('fails with manifest_signer_unverified when manifest is not verified', () => {
    const result = evaluateAnchoredTier(subject(), 12, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toEqual(['manifest_signer_unverified']);
    }
  });

  it('fails with subject_unknown when kind is unknown', () => {
    const result = evaluateAnchoredTier(subject('unknown'), 12, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toEqual(['subject_unknown']);
    }
  });

  it('marks manifest signer as required', () => {
    expect(ANCHORED_TIER_REQUIREMENT.requireManifestSigner).toBe(true);
  });

  it('aggregates all three applicable reasons when everything is wrong', () => {
    const result = evaluateAnchoredTier(subject('unknown'), 0, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toEqual([
        'subject_unknown',
        'declared_sources_below_threshold',
        'manifest_signer_unverified',
      ]);
    }
  });
});

describe('evaluateSealedTier', () => {
  it('passes when count >= 18, manifest verified, forensic present', () => {
    const result = evaluateSealedTier(subject(), 18, true, true);
    expect(result.ok).toBe(true);
    expect(result.tier).toBe('Sealed');
    expect(result.requirement).toEqual(SEALED_TIER_REQUIREMENT);
  });

  it('fails with declared_sources_below_threshold when count < 18', () => {
    const result = evaluateSealedTier(subject(), 17, true, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toEqual(['declared_sources_below_threshold']);
    }
  });

  it('fails with manifest_signer_unverified when manifest is not verified', () => {
    const result = evaluateSealedTier(subject(), 18, false, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toEqual(['manifest_signer_unverified']);
    }
  });

  it('fails with forensic_input_missing when forensic inputs are absent', () => {
    const result = evaluateSealedTier(subject(), 18, true, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toEqual(['forensic_input_missing']);
    }
  });

  it('fails with subject_unknown when kind is unknown', () => {
    const result = evaluateSealedTier(subject('unknown'), 18, true, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toEqual(['subject_unknown']);
    }
  });

  it('aggregates every applicable reason when nothing passes', () => {
    const result = evaluateSealedTier(subject('unknown'), 0, false, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toEqual([
        'subject_unknown',
        'declared_sources_below_threshold',
        'manifest_signer_unverified',
        'forensic_input_missing',
      ]);
    }
  });

  it('locks the 18-source minimum + manifest + forensic requirements', () => {
    expect(SEALED_TIER_REQUIREMENT.minDeclaredSources).toBe(18);
    expect(SEALED_TIER_REQUIREMENT.requireManifestSigner).toBe(true);
  });
});
