import type {
  GithubEvidence,
  GithubRepoP0,
  MultiSourceEvidence,
  SourcifyEntryEvidence,
} from '@veral/score/v1.0';
import type { AgentResult } from '@veral/shared';
import type { GithubFindings, SourcifyFindings, SourcifyMatchLevel } from '@veral/sources';

export const SOURCIFY_AGENT_ID = 'sourcify-extract' as const;
export const GITHUB_AGENT_ID = 'github-extract' as const;

// The score engine consumes a typed evidence object (sourcify / github /
// onchain / ensInternal). Each agent registered in
// @veral/sources#createExtractorRegistry maps to exactly one slice;
// agents the workspace has not yet shipped stay kind:'absent'.
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

function isGithubFindings(value: unknown): value is GithubFindings {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.trust === 'unverified' && Array.isArray(obj.repos);
}

function toGithubRepoP0(repo: GithubFindings['repos'][number]): GithubRepoP0 {
  // P0 surface only — pushedAt, hasTestDir, hasSubstantialReadme,
  // hasLicense. P1 fields (hasSecurity / hasDependabot /
  // hasBranchProtection / ciRuns / bugIssues / releasesLast12m) stay
  // undefined; the score engine's repoHygiene treats undefined as
  // "P1 didn't run for this repo" and only counts defined booleans.
  return {
    pushedAt: repo.pushedAt,
    hasTestDir: repo.hasTestDir,
    hasSubstantialReadme: repo.hasSubstantialReadme,
    hasLicense: repo.hasLicense,
  };
}

function mapGithubResult(result: AgentResult<unknown>): GithubEvidence {
  if (result.status === 'error') return { kind: 'error' };
  if (!isGithubFindings(result.findings)) return { kind: 'error' };
  // status='partial' is emitted for "no declared github source" and
  // for "owner endpoint returned 404 / user is null" — both surface
  // here as the score-engine's 'absent' signal so the GitHub component
  // axis short-circuits to null_no_data rather than 0.
  if (result.findings.user === null) return { kind: 'absent' };
  return {
    kind: 'ok',
    value: {
      user: { login: result.findings.user.login },
      repos: result.findings.repos.map(toGithubRepoP0),
    },
  };
}

export function adaptAgentResultsToEvidence(
  agentResults: ReadonlyArray<AgentResult<unknown>>,
): MultiSourceEvidence {
  const sourcify: SourcifyEntryEvidence[] = [];
  let github: GithubEvidence = { kind: 'absent' };
  for (const result of agentResults) {
    if (result.agentId === SOURCIFY_AGENT_ID) {
      if (result.status !== 'ok' || !isSourcifyFindings(result.findings)) continue;
      for (const contract of result.findings.contracts) {
        sourcify.push(toSourcifyEntryEvidence(contract.match));
      }
    } else if (result.agentId === GITHUB_AGENT_ID) {
      github = mapGithubResult(result);
    }
  }
  return {
    subject: { mode: 'manifest', manifest: null },
    sourcify,
    github,
    onchain: [],
    ensInternal: { kind: 'absent' },
  };
}
