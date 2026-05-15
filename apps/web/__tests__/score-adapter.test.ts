import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL ??= 'http://kv.test.invalid';
  process.env.KV_REST_API_TOKEN ??= 'kv-test-token';
  process.env.TURSO_DATABASE_URL ??= 'file::memory:';
});

import type { AgentResult } from '@veral/shared';
import type { SourcifyFindings } from '@veral/sources';

import { adaptAgentResultsToEvidence, SOURCIFY_AGENT_ID } from '../lib/score-adapter.js';

function sourcifyResult(findings: SourcifyFindings): AgentResult<SourcifyFindings> {
  return {
    agentId: SOURCIFY_AGENT_ID,
    agentVersion: '1.0.0',
    runUuid: 'run-1',
    runStartedAt: 0,
    runFinishedAt: 1,
    status: 'ok',
    findings,
    provenance: {
      backend: { kind: 'rest-api', baseUrl: 'http://test', version: '2' },
      inputHash: '0x',
    },
  };
}

function findings(contracts: SourcifyFindings['contracts']): SourcifyFindings {
  return {
    trust: 'verified',
    contracts,
    verifiedCount: contracts.filter((c) => c.match === 'exact_match').length,
    partialCount: contracts.filter((c) => c.match === 'match').length,
    notFoundCount: contracts.filter((c) => c.match === 'not_found').length,
  };
}

describe('adaptAgentResultsToEvidence', () => {
  it('returns a fully-absent evidence object when no agents ran', () => {
    const ev = adaptAgentResultsToEvidence([]);
    expect(ev.sourcify).toEqual([]);
    expect(ev.github.kind).toBe('absent');
    expect(ev.onchain).toEqual([]);
    expect(ev.ensInternal.kind).toBe('absent');
    expect(ev.subject.mode).toBe('manifest');
  });

  it('maps an exact_match Sourcify finding into a verified entry that passes the complexity gate', () => {
    const ev = adaptAgentResultsToEvidence([
      sourcifyResult(
        findings([
          {
            chainId: 1,
            address: `0x${'a'.repeat(40)}` as `0x${string}`,
            match: 'exact_match',
            compilerVersion: null,
            language: null,
            contractName: null,
          },
        ]),
      ),
    ]);
    expect(ev.sourcify).toHaveLength(1);
    const entry = ev.sourcify[0];
    expect(entry?.kind).toBe('ok');
    if (entry?.kind === 'ok') {
      expect(entry.deep.match).toBe('exact_match');
      expect(entry.deep.creationMatch).toBe('exact_match');
      expect(entry.deep.runtimeMatch).toBe('exact_match');
      expect(entry.deep.functionSignatures).toBeNull();
    }
  });

  it('always emits functionSignatures null until the Sourcify agent surfaces real signatures', () => {
    const ev = adaptAgentResultsToEvidence([
      sourcifyResult(
        findings([
          {
            chainId: 1,
            address: `0x${'1'.repeat(40)}` as `0x${string}`,
            match: 'exact_match',
            compilerVersion: null,
            language: null,
            contractName: null,
          },
          {
            chainId: 11_155_111,
            address: `0x${'2'.repeat(40)}` as `0x${string}`,
            match: 'match',
            compilerVersion: null,
            language: null,
            contractName: null,
          },
          {
            chainId: 1,
            address: `0x${'3'.repeat(40)}` as `0x${string}`,
            match: 'not_found',
            compilerVersion: null,
            language: null,
            contractName: null,
          },
        ]),
      ),
    ]);
    expect(ev.sourcify).toHaveLength(3);
    for (const entry of ev.sourcify) {
      if (entry.kind === 'ok') {
        expect(entry.deep.functionSignatures).toBeNull();
      }
    }
  });

  it('maps a partial match Sourcify finding into a non-exact entry', () => {
    const ev = adaptAgentResultsToEvidence([
      sourcifyResult(
        findings([
          {
            chainId: 1,
            address: `0x${'b'.repeat(40)}` as `0x${string}`,
            match: 'match',
            compilerVersion: null,
            language: null,
            contractName: null,
          },
        ]),
      ),
    ]);
    const entry = ev.sourcify[0];
    if (entry?.kind === 'ok') {
      expect(entry.deep.match).toBe('match');
      expect(entry.deep.creationMatch).toBe('match');
      expect(entry.deep.runtimeMatch).toBe('match');
    }
  });

  it('maps a not_found Sourcify finding into a not_found entry with null sub-matches', () => {
    const ev = adaptAgentResultsToEvidence([
      sourcifyResult(
        findings([
          {
            chainId: 1,
            address: `0x${'c'.repeat(40)}` as `0x${string}`,
            match: 'not_found',
            compilerVersion: null,
            language: null,
            contractName: null,
          },
        ]),
      ),
    ]);
    const entry = ev.sourcify[0];
    if (entry?.kind === 'ok') {
      expect(entry.deep.match).toBe('not_found');
      expect(entry.deep.creationMatch).toBeNull();
      expect(entry.deep.runtimeMatch).toBeNull();
    }
  });

  it('skips non-Sourcify agent results', () => {
    const otherAgentResult: AgentResult<unknown> = {
      agentId: 'github-extract',
      agentVersion: '1.0.0',
      runUuid: 'r',
      runStartedAt: 0,
      runFinishedAt: 1,
      status: 'ok',
      findings: { some: 'github thing' },
      provenance: {
        backend: { kind: 'rest-api', baseUrl: 'http://test', version: '1' },
        inputHash: '0x',
      },
    };
    const ev = adaptAgentResultsToEvidence([otherAgentResult]);
    expect(ev.sourcify).toEqual([]);
  });

  it('skips Sourcify results with status != ok or malformed findings', () => {
    const errored: AgentResult<unknown> = {
      agentId: SOURCIFY_AGENT_ID,
      agentVersion: '1.0.0',
      runUuid: 'r',
      runStartedAt: 0,
      runFinishedAt: 1,
      status: 'error',
      findings: null,
      provenance: {
        backend: { kind: 'rest-api', baseUrl: 'http://test', version: '2' },
        inputHash: '0x',
        errorMessage: 'sourcify: rate limited',
      },
    };
    const malformed: AgentResult<unknown> = {
      agentId: SOURCIFY_AGENT_ID,
      agentVersion: '1.0.0',
      runUuid: 'r',
      runStartedAt: 0,
      runFinishedAt: 1,
      status: 'ok',
      findings: { not: 'the right shape' },
      provenance: {
        backend: { kind: 'rest-api', baseUrl: 'http://test', version: '2' },
        inputHash: '0x',
      },
    };
    const ev = adaptAgentResultsToEvidence([errored, malformed]);
    expect(ev.sourcify).toEqual([]);
  });
});
