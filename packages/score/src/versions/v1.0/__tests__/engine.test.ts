import { describe, expect, it } from 'vitest';

import { computeScore } from '../engine';
import type { MultiSourceEvidence } from '../evidence-types';

const SUBJECT_NAMEHASH = `0x${'a'.repeat(64)}` as `0x${string}`;
const NOW_SECONDS = 1_715_788_800; // 2026-05-15T12:00:00Z

function emptyEvidence(): MultiSourceEvidence {
  return {
    subject: { mode: 'manifest', manifest: null },
    sourcify: [],
    github: { kind: 'absent' },
    onchain: [],
    ensInternal: { kind: 'absent' },
  };
}

function baseOptions() {
  return {
    nowSeconds: NOW_SECONDS,
    subjectNamehash: SUBJECT_NAMEHASH,
    tier: 'Public' as const,
    computedAt: NOW_SECONDS,
  };
}

describe('computeScore (v1.0)', () => {
  it('returns the canonical Veral ScoreResult shape', () => {
    const result = computeScore(emptyEvidence(), baseOptions());
    expect(result.subjectNamehash).toBe(SUBJECT_NAMEHASH);
    expect(result.tier).toBe('Public');
    expect(result.formulaVersion).toBe('v1.0.0');
    expect(result.computedAt).toBe(NOW_SECONDS);
    expect(result.components).toHaveLength(10);
    expect(Number.isInteger(result.score)).toBe(true);
  });

  it('empty evidence yields a zero score (every component null)', () => {
    const result = computeScore(emptyEvidence(), baseOptions());
    expect(result.score).toBe(0);
    expect(result.components.every((c) => c.rawValue === 0)).toBe(true);
    expect(result.components.every((c) => c.contribution === 0)).toBe(true);
  });

  it('score is clamped to [0, 100]', () => {
    const evidence: MultiSourceEvidence = {
      subject: { mode: 'manifest', manifest: null },
      sourcify: [
        {
          kind: 'ok',
          deep: {
            match: 'exact_match',
            creationMatch: 'exact_match',
            runtimeMatch: 'exact_match',
            functionSignatures: [{}, {}, {}],
          },
        },
      ],
      github: {
        kind: 'ok',
        value: {
          user: { login: 'alice' },
          repos: [
            {
              pushedAt: new Date(NOW_SECONDS * 1000).toISOString(),
              hasTestDir: true,
              hasSubstantialReadme: true,
              hasLicense: true,
              hasSecurity: true,
              hasDependabot: true,
              hasBranchProtection: true,
              ciRuns: { successful: 100, total: 100 },
              bugIssues: { closed: 10, total: 10 },
              releasesLast12m: 24,
            },
          ],
        },
      },
      onchain: [
        {
          kind: 'ok',
          chainId: 1,
          value: {
            nonce: 100_000,
            firstTxBlock: 100n,
            latestBlock: 20_000_000n,
            transferCountRecent90d: 5000,
            transferCountProvider: 'alchemy',
          },
        },
      ],
      ensInternal: {
        kind: 'ok',
        value: {
          registrationDate: NOW_SECONDS - 86400,
          subnameCount: 1,
          textRecordCount: 1,
          lastRecordUpdateBlock: 20_000_000n,
        },
      },
    };
    const result = computeScore(evidence, baseOptions());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('verified Sourcify entry alone contributes seniority + relevance', () => {
    const evidence: MultiSourceEvidence = {
      ...emptyEvidence(),
      sourcify: [
        {
          kind: 'ok',
          deep: {
            match: 'exact_match',
            creationMatch: 'exact_match',
            runtimeMatch: 'exact_match',
            functionSignatures: [{}, {}, {}],
          },
        },
      ],
    };
    const result = computeScore(evidence, baseOptions());
    // compileSuccess: 0.25 * 1.0 * 1.0 = 0.25 (seniority)
    // sourcifyRecency: 0.30 * 1.0 * 1.0 = 0.30 (relevance)
    // score_raw = 0.5*0.25 + 0.5*0.30 = 0.275 -> score_100 = 28
    expect(result.score).toBe(28);
    const compile = result.components.find((c) => c.domain === 'sourcify' && c.weight === 0.25);
    expect(compile?.contribution).toBeCloseTo(0.25, 10);
    expect(compile?.trustDiscount).toBe(1.0);
  });

  it('unverified GitHub signals get the 0.6 trust discount', () => {
    const evidence: MultiSourceEvidence = {
      ...emptyEvidence(),
      github: {
        kind: 'ok',
        value: {
          user: { login: 'alice' },
          repos: [
            {
              pushedAt: null,
              hasTestDir: true,
              hasSubstantialReadme: true,
              hasLicense: true,
            },
          ],
        },
      },
    };
    const result = computeScore(evidence, baseOptions());
    // testPresence (1) and repoHygiene (1) are 'unverified' -> discount 0.6
    const githubComponents = result.components.filter((c) => c.domain === 'github');
    for (const c of githubComponents) {
      if (c.rawValue > 0) {
        expect(c.trustDiscount).toBe(0.6);
      }
    }
  });

  it('echoes Anchored tier from options through to the result', () => {
    const result = computeScore(emptyEvidence(), { ...baseOptions(), tier: 'Anchored' });
    expect(result.tier).toBe('Anchored');
  });

  it('preserves component order: seniority axis first, then relevance', () => {
    const result = computeScore(emptyEvidence(), baseOptions());
    const ids = [
      'sourcify',
      'github',
      'github',
      'github',
      'github',
      'github',
      'sourcify',
      'github',
      'onchain',
      'ens-internal',
    ];
    expect(result.components.map((c) => c.domain)).toEqual(ids);
  });
});
