import { describe, expect, it } from 'vitest';

import {
  agentStatusDisplay,
  clusterByDomain,
  errorPanelContent,
  formatComputedAt,
  formatPercent,
  formatScore,
  formatTrustDiscount,
  tierBadge,
} from '../lib/bench-page';

describe('formatScore', () => {
  it('rounds to integer and clamps to 0..100', () => {
    expect(formatScore(0)).toBe('00');
    expect(formatScore(7.4)).toBe('07');
    expect(formatScore(7.5)).toBe('08');
    expect(formatScore(83)).toBe('83');
    expect(formatScore(100)).toBe('100');
    expect(formatScore(150)).toBe('100');
    expect(formatScore(-5)).toBe('00');
  });

  it('pads single-digit scores so the LCP element width is stable', () => {
    expect(formatScore(3).length).toBe(2);
    expect(formatScore(30).length).toBe(2);
  });
});

describe('formatPercent', () => {
  it('multiplies, rounds, and clamps to [0, 1]', () => {
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(0.5)).toBe('50.0%');
    expect(formatPercent(1)).toBe('100.0%');
    expect(formatPercent(2)).toBe('100.0%');
    expect(formatPercent(-0.1)).toBe('0.0%');
  });

  it('respects the optional fraction-digits override', () => {
    expect(formatPercent(0.12345, 2)).toBe('12.35%');
    expect(formatPercent(0.12345, 0)).toBe('12%');
  });
});

describe('formatTrustDiscount', () => {
  it('renders verified and unverified factors with the ×N.NN shape', () => {
    expect(formatTrustDiscount(1)).toBe('×1.00');
    expect(formatTrustDiscount(0.6)).toBe('×0.60');
  });
});

describe('formatComputedAt', () => {
  it('uses ISO-8601 UTC so the server-rendered page is cache-friendly', () => {
    expect(formatComputedAt(1_715_788_800)).toBe('2024-05-15T16:00:00.000Z');
  });
});

describe('tierBadge', () => {
  it('maps the three tier keys to their display labels and tones', () => {
    expect(tierBadge('Public')).toEqual({ label: 'Public', tone: 'public' });
    expect(tierBadge('Anchored')).toEqual({ label: 'Anchored', tone: 'anchored' });
    expect(tierBadge('Sealed')).toEqual({ label: 'Sealed', tone: 'sealed' });
  });
});

describe('agentStatusDisplay', () => {
  it('maps every agent status to a label and tone', () => {
    expect(agentStatusDisplay('ok')).toEqual({ label: 'OK', tone: 'ok' });
    expect(agentStatusDisplay('partial')).toEqual({ label: 'Partial', tone: 'partial' });
    expect(agentStatusDisplay('error')).toEqual({ label: 'Error', tone: 'error' });
    expect(agentStatusDisplay('absent')).toEqual({ label: 'Absent', tone: 'absent' });
  });
});

describe('errorPanelContent', () => {
  it('produces a distinct title for every BenchHandler error code', () => {
    const codes = ['BAD_REQUEST', 'NOT_FOUND', 'BAD_GATEWAY', 'INTERNAL'] as const;
    const titles = new Set(codes.map((c) => errorPanelContent(c).title));
    expect(titles.size).toBe(codes.length);
  });

  it('attaches a hint to the user-fixable cases (400/404/502) but omits it for 500', () => {
    expect(errorPanelContent('BAD_REQUEST').hint).toBeDefined();
    expect(errorPanelContent('NOT_FOUND').hint).toBeDefined();
    expect(errorPanelContent('BAD_GATEWAY').hint).toBeDefined();
    expect(errorPanelContent('INTERNAL').hint).toBeUndefined();
  });
});

describe('clusterByDomain', () => {
  it('groups components by domain in insertion order', () => {
    const components = [
      { domain: 'sourcify', weight: 0.25, rawValue: 1, contribution: 0.25, trustDiscount: 1 },
      { domain: 'github', weight: 0.15, rawValue: 0, contribution: 0, trustDiscount: 0.6 },
      { domain: 'sourcify', weight: 0.3, rawValue: 1, contribution: 0.3, trustDiscount: 1 },
    ];
    const clusters = clusterByDomain(components);
    expect(clusters.map((c) => c.domain)).toEqual(['sourcify', 'github']);
    expect(clusters[0]?.components).toHaveLength(2);
    expect(clusters[0]?.trust).toBe('verified');
    expect(clusters[1]?.trust).toBe('unverified');
  });

  it('returns an empty array for an empty component list', () => {
    expect(clusterByDomain([])).toEqual([]);
  });
});
