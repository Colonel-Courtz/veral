import { describe, expect, it } from 'vitest';

import {
  AXIS_WEIGHTS,
  RELEVANCE_WEIGHTS,
  SENIORITY_WEIGHTS,
  TRUST_DISCOUNT_UNVERIFIED,
  TRUST_DISCOUNT_VERIFIED,
  trustFactor,
} from '../weights.js';

function sumWeights(table: Record<string, { weight: number }>): number {
  return Object.values(table).reduce((acc, c) => acc + c.weight, 0);
}

describe('v1.0 weights (LOCKED)', () => {
  it('locked trust-discount constants', () => {
    expect(TRUST_DISCOUNT_VERIFIED).toBe(1.0);
    expect(TRUST_DISCOUNT_UNVERIFIED).toBe(0.6);
  });

  it('seniority weights sum to 1.0', () => {
    expect(sumWeights(SENIORITY_WEIGHTS)).toBeCloseTo(1.0, 10);
  });

  it('relevance weights sum to 1.0', () => {
    expect(sumWeights(RELEVANCE_WEIGHTS)).toBeCloseTo(1.0, 10);
  });

  it('axis weights sum to 1.0', () => {
    expect(AXIS_WEIGHTS.seniority + AXIS_WEIGHTS.relevance).toBeCloseTo(1.0, 10);
  });

  it('compileSuccess locked at 0.25 verified', () => {
    expect(SENIORITY_WEIGHTS.compileSuccess.weight).toBe(0.25);
    expect(SENIORITY_WEIGHTS.compileSuccess.trust).toBe('verified');
  });

  it('sourcifyRecency locked at 0.30 verified', () => {
    expect(RELEVANCE_WEIGHTS.sourcifyRecency.weight).toBe(0.3);
    expect(RELEVANCE_WEIGHTS.sourcifyRecency.trust).toBe('verified');
  });

  it('githubRecency locked at 0.30 unverified', () => {
    expect(RELEVANCE_WEIGHTS.githubRecency.weight).toBe(0.3);
    expect(RELEVANCE_WEIGHTS.githubRecency.trust).toBe('unverified');
  });

  it('trustFactor maps labels to discount constants', () => {
    expect(trustFactor('verified')).toBe(TRUST_DISCOUNT_VERIFIED);
    expect(trustFactor('unverified')).toBe(TRUST_DISCOUNT_UNVERIFIED);
  });
});
