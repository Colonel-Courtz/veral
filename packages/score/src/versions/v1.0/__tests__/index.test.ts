import { describe, expect, it } from 'vitest';

import { computeForVersion, SCORE_PACKAGE_VERSIONS } from '../../../index';
import { computeScore } from '../engine';

describe('computeForVersion', () => {
  it('lists v1.0 in SCORE_PACKAGE_VERSIONS', () => {
    expect(SCORE_PACKAGE_VERSIONS).toContain('v1.0');
  });

  it('returns the v1.0 engine for "v1.0"', () => {
    expect(computeForVersion('v1.0')).toBe(computeScore);
  });
});
