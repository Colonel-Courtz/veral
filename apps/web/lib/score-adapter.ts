import type { MultiSourceEvidence, SourcifyEntryEvidence } from '@veral/score/v1.0';
import type { AgentResult } from '@veral/shared';
import type { SourcifyFindings, SourcifyMatchLevel } from '@veral/sources';

export const SOURCIFY_AGENT_ID = 'sourcify-extract' as const;

// The score engine consumes a typed evidence object (sourcify / github /
// onchain / ensInternal). v1.0 free endpoint only registers Sourcify, so
// other slices are kind:'absent' until their respective agents ship.
//
// Sourcify agent does not yet surface function signatures. Setting
// functionSignatures: null defers the anti-gaming complexity gate to
// follow-up work; until then, verified contracts contribute to
// recency but not to compileSuccess (the gate excludes null-sig
// entries rather than fail-open).
function toSourcifyEntryEvidence(match: SourcifyMatchLevel): SourcifyEntryEvidence {
  if (match === 'not_found') {
    return {
      kind: 'ok',
      deep: {
        match,
        creationMatch: null,
        runtimeMatch: null,
        functionSignatures: null,
      },
    };
  }
  // Sourcify agent's match-level is the only signal we get for v1; we have
  // no per-creation/runtime granularity yet. Mirror the headline into both
  // so callers that read creationMatch/runtimeMatch see the same level.
  return {
    kind: 'ok',
    deep: {
      match,
      creationMatch: match === 'exact_match' ? 'exact_match' : 'match',
      runtimeMatch: match === 'exact_match' ? 'exact_match' : 'match',
      functionSignatures: null,
    },
  };
}

function isSourcifyFindings(value: unknown): value is SourcifyFindings {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.trust === 'verified' && Array.isArray(obj.contracts);
}

export function adaptAgentResultsToEvidence(
  agentResults: ReadonlyArray<AgentResult<unknown>>,
): MultiSourceEvidence {
  const sourcify: SourcifyEntryEvidence[] = [];
  for (const result of agentResults) {
    if (result.agentId !== SOURCIFY_AGENT_ID) continue;
    if (result.status !== 'ok' || !isSourcifyFindings(result.findings)) continue;
    for (const contract of result.findings.contracts) {
      sourcify.push(toSourcifyEntryEvidence(contract.match));
    }
  }
  return {
    subject: { mode: 'manifest', manifest: null },
    sourcify,
    github: { kind: 'absent' },
    onchain: [],
    ensInternal: { kind: 'absent' },
  };
}
