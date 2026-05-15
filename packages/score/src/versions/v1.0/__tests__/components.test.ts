import { describe, expect, it } from 'vitest';

import {
  bugHygiene,
  ciPassRate,
  compileSuccess,
  ensRecency,
  githubRecency,
  nonZeroSourceCount,
  onchainRecency,
  releaseCadence,
  repoHygiene,
  sourcifyRecency,
  testPresence,
} from '../components';
import type { MultiSourceEvidence } from '../evidence-types';

const NOW = 1_715_788_800;

function empty(): MultiSourceEvidence {
  return {
    subject: { mode: 'manifest', manifest: null },
    sourcify: [],
    github: { kind: 'absent' },
    onchain: [],
    ensInternal: { kind: 'absent' },
  };
}

describe('compileSuccess', () => {
  it('returns null_no_data when no entries pass the complexity gate', () => {
    expect(compileSuccess(empty())).toEqual({ value: null, status: 'null_no_data' });
  });

  it('ignores low-complexity entries (function signatures < 2)', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
      sourcify: [
        {
          kind: 'ok',
          deep: {
            match: 'exact_match',
            creationMatch: 'exact_match',
            runtimeMatch: 'exact_match',
            functionSignatures: [{}],
          },
        },
      ],
    };
    expect(compileSuccess(ev)).toEqual({ value: null, status: 'null_no_data' });
  });

  it('treats functionSignatures null as cannot-verify and excludes from numerator', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
      sourcify: [
        {
          kind: 'ok',
          deep: {
            match: 'exact_match',
            creationMatch: 'exact_match',
            runtimeMatch: 'exact_match',
            functionSignatures: null,
          },
        },
      ],
    };
    expect(compileSuccess(ev)).toEqual({ value: null, status: 'null_no_data' });
  });

  it('excludes null-signature entries even when other entries qualify', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
      sourcify: [
        {
          kind: 'ok',
          deep: {
            match: 'exact_match',
            creationMatch: 'exact_match',
            runtimeMatch: 'exact_match',
            functionSignatures: null,
          },
        },
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
    // Denominator is 1 (the qualifying entry); the null-sig entry is
    // excluded from both numerator and denominator.
    expect(compileSuccess(ev)).toEqual({ value: 1, status: 'computed' });
  });

  it('counts entries where both creationMatch and runtimeMatch are exact', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
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
        {
          kind: 'ok',
          deep: {
            match: 'match',
            creationMatch: 'match',
            runtimeMatch: 'match',
            functionSignatures: [{}, {}, {}],
          },
        },
      ],
    };
    expect(compileSuccess(ev)).toEqual({ value: 0.5, status: 'computed' });
  });
});

describe('testPresence + repoHygiene', () => {
  it('null_no_data when github absent', () => {
    expect(testPresence(empty())).toEqual({ value: null, status: 'null_no_data' });
    expect(repoHygiene(empty())).toEqual({ value: null, status: 'null_no_data' });
  });

  it('mean of hasTestDir across repos', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
      github: {
        kind: 'ok',
        value: {
          user: { login: 'a' },
          repos: [
            { pushedAt: null, hasTestDir: true, hasSubstantialReadme: false, hasLicense: false },
            { pushedAt: null, hasTestDir: false, hasSubstantialReadme: false, hasLicense: false },
          ],
        },
      },
    };
    expect(testPresence(ev)).toEqual({ value: 0.5, status: 'computed' });
  });

  it('repoHygiene grows denominator with each P1 boolean present', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
      github: {
        kind: 'ok',
        value: {
          user: { login: 'a' },
          repos: [
            {
              pushedAt: null,
              hasTestDir: false,
              hasSubstantialReadme: true,
              hasLicense: true,
              hasSecurity: false,
            },
          ],
        },
      },
    };
    // signals=2 (readme+license), count=3 (readme+license+security present as boolean)
    expect(repoHygiene(ev)).toEqual({ value: 2 / 3, status: 'computed' });
  });
});

describe('sourcifyRecency', () => {
  it('null_no_data with empty sourcify', () => {
    expect(sourcifyRecency(empty())).toEqual({ value: null, status: 'null_no_data' });
  });

  it('1.0 when any entry is verified', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
      sourcify: [
        {
          kind: 'ok',
          deep: {
            match: 'match',
            creationMatch: 'exact_match',
            runtimeMatch: null,
            functionSignatures: null,
          },
        },
      ],
    };
    expect(sourcifyRecency(ev)).toEqual({ value: 1.0, status: 'computed' });
  });

  it('0 when entries exist but none verified', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
      sourcify: [{ kind: 'error' }],
    };
    expect(sourcifyRecency(ev)).toEqual({ value: 0, status: 'computed' });
  });
});

describe('githubRecency', () => {
  it('counts only repos pushed within 90 days', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
      github: {
        kind: 'ok',
        value: {
          user: { login: 'a' },
          repos: [
            {
              pushedAt: new Date((NOW - 30 * 86400) * 1000).toISOString(),
              hasTestDir: false,
              hasSubstantialReadme: false,
              hasLicense: false,
            },
            {
              pushedAt: new Date((NOW - 200 * 86400) * 1000).toISOString(),
              hasTestDir: false,
              hasSubstantialReadme: false,
              hasLicense: false,
            },
          ],
        },
      },
    };
    expect(githubRecency(ev, NOW)).toEqual({ value: 0.5, status: 'computed' });
  });
});

describe('onchainRecency', () => {
  it('prefers indexer signal (transferCountRecent90d) when present', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
      onchain: [
        {
          kind: 'ok',
          chainId: 1,
          value: {
            nonce: 50,
            firstTxBlock: 1n,
            latestBlock: 100n,
            transferCountRecent90d: 500,
            transferCountProvider: 'alchemy',
          },
        },
      ],
    };
    const result = onchainRecency(ev);
    expect(result.value).toBe(0.5);
    expect(result.status).toBe('computed');
    expect(result.note).toMatch(/alchemy/);
  });

  it('falls back to nonce/1000 when no indexer signal', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
      onchain: [
        {
          kind: 'ok',
          chainId: 1,
          value: { nonce: 200, firstTxBlock: null, latestBlock: 1n },
        },
      ],
    };
    const result = onchainRecency(ev);
    expect(result.value).toBe(0.2);
    expect(result.note).toMatch(/fallback/);
  });
});

describe('ensRecency', () => {
  it('refuses to fabricate nowBlock when no mainnet entry is present', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
      ensInternal: {
        kind: 'ok',
        value: {
          registrationDate: NOW - 86400,
          subnameCount: 0,
          textRecordCount: 1,
          lastRecordUpdateBlock: 20_000_000n,
        },
      },
    };
    expect(ensRecency(ev, NOW)).toEqual({ value: null, status: 'null_no_data' });
  });

  it('computes freshness against mainnet latestBlock', () => {
    const lastBlock = 20_000_000n;
    const ev: MultiSourceEvidence = {
      ...empty(),
      onchain: [
        {
          kind: 'ok',
          chainId: 1,
          value: { nonce: 1, firstTxBlock: 1n, latestBlock: lastBlock },
        },
      ],
      ensInternal: {
        kind: 'ok',
        value: {
          registrationDate: NOW - 86400,
          subnameCount: 0,
          textRecordCount: 1,
          lastRecordUpdateBlock: lastBlock,
        },
      },
    };
    expect(ensRecency(ev, NOW).value).toBe(1.0);
  });
});

describe('ciPassRate / bugHygiene / releaseCadence', () => {
  it('all return null_p1 when no repo carries the corresponding enrichment', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
      github: {
        kind: 'ok',
        value: {
          user: { login: 'a' },
          repos: [
            { pushedAt: null, hasTestDir: false, hasSubstantialReadme: false, hasLicense: false },
          ],
        },
      },
    };
    expect(ciPassRate(ev).status).toBe('null_p1');
    expect(bugHygiene(ev).status).toBe('null_p1');
    expect(releaseCadence(ev).status).toBe('null_p1');
  });

  it('bugHygiene short-circuits to 1.0 when bug-labeled denominator is zero', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
      github: {
        kind: 'ok',
        value: {
          user: { login: 'a' },
          repos: [
            {
              pushedAt: null,
              hasTestDir: false,
              hasSubstantialReadme: false,
              hasLicense: false,
              bugIssues: { closed: 0, total: 0 },
            },
          ],
        },
      },
    };
    expect(bugHygiene(ev).value).toBe(1.0);
  });

  it('releaseCadence caps at 12 / 12', () => {
    const ev: MultiSourceEvidence = {
      ...empty(),
      github: {
        kind: 'ok',
        value: {
          user: { login: 'a' },
          repos: [
            {
              pushedAt: null,
              hasTestDir: false,
              hasSubstantialReadme: false,
              hasLicense: false,
              releasesLast12m: 50,
            },
          ],
        },
      },
    };
    expect(releaseCadence(ev).value).toBe(1.0);
  });
});

describe('nonZeroSourceCount', () => {
  it('counts each source that produced non-empty evidence', () => {
    const ev: MultiSourceEvidence = {
      subject: { mode: 'manifest', manifest: null },
      sourcify: [
        {
          kind: 'ok',
          deep: {
            match: 'exact_match',
            creationMatch: 'exact_match',
            runtimeMatch: 'exact_match',
            functionSignatures: [],
          },
        },
      ],
      github: { kind: 'ok', value: { user: { login: 'a' }, repos: [] } },
      onchain: [
        {
          kind: 'ok',
          chainId: 1,
          value: { nonce: 5, firstTxBlock: 1n, latestBlock: 10n },
        },
      ],
      ensInternal: {
        kind: 'ok',
        value: {
          registrationDate: 123,
          subnameCount: 0,
          textRecordCount: 0,
          lastRecordUpdateBlock: null,
        },
      },
    };
    expect(nonZeroSourceCount(ev)).toBe(4);
  });
});
