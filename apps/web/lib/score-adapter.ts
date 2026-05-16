import type {
  EnsInternalEvidence,
  EnsInternalSignals,
  GithubEvidence,
  GithubRepoP0,
  MultiSourceEvidence,
  OnchainActivity,
  OnchainEntryEvidence,
  SourcifyEntryEvidence,
} from '@veral/score/v1.0';
import type { AgentResult } from '@veral/shared';
import type {
  EnsFindings,
  EthereumFindings,
  GithubFindings,
  SourcifyFindings,
  SourcifyMatchLevel,
} from '@veral/sources';

export const SOURCIFY_AGENT_ID = 'sourcify-extract' as const;
export const GITHUB_AGENT_ID = 'github-extract' as const;
export const ETHEREUM_AGENT_ID = 'ethereum-extract' as const;
export const ENS_AGENT_ID = 'ens-extract' as const;

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

function isEthereumFindings(value: unknown): value is EthereumFindings {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.trust === 'verified' &&
    typeof obj.nonce === 'number' &&
    typeof obj.latestBlock === 'number' &&
    typeof obj.chainId === 'number'
  );
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

function toOnchainActivity(findings: EthereumFindings): OnchainActivity {
  // The agent stores block numbers as `number` for JSON-cache safety;
  // the score engine consumes `bigint`. Conversion lives here so the
  // type widening happens at exactly one boundary and a future change
  // to either side does not silently lose precision.
  return {
    nonce: findings.nonce,
    firstTxBlock: findings.firstTxBlock !== null ? BigInt(findings.firstTxBlock) : null,
    latestBlock: BigInt(findings.latestBlock),
    transferCountRecent90d: findings.transferCountRecent90d,
    transferCountProvider: findings.transferCountProvider,
  };
}

function fallbackChainId(value: unknown): number {
  // Error-path chainId source: prefer findings.chainId when present,
  // otherwise default to mainnet so the score engine's resolveNowBlock
  // can still find a mainnet onchain entry even on malformed payloads.
  if (typeof value === 'object' && value !== null) {
    const candidate = (value as Record<string, unknown>).chainId;
    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return 1;
}

function mapEthereumResult(result: AgentResult<unknown>): OnchainEntryEvidence | null {
  if (result.status === 'partial') return null;
  if (result.status === 'error' || !isEthereumFindings(result.findings)) {
    return { kind: 'error', chainId: fallbackChainId(result.findings) };
  }
  return {
    kind: 'ok',
    chainId: result.findings.chainId,
    value: toOnchainActivity(result.findings),
  };
}

function mapSourcifyResult(result: AgentResult<unknown>): ReadonlyArray<SourcifyEntryEvidence> {
  if (result.status !== 'ok' || !isSourcifyFindings(result.findings)) return [];
  return result.findings.contracts.map((contract) => toSourcifyEntryEvidence(contract.match));
}

function isEnsFindings(value: unknown): value is EnsFindings {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.trust === 'verified' && typeof obj.ensName === 'string';
}

function toEnsInternalSignals(findings: EnsFindings): EnsInternalSignals {
  // The agent stores lastUpdateBlock as `number` for JSON-cache safety;
  // the score engine consumes `bigint`. Mirrors the onchain pattern in
  // toOnchainActivity — number → bigint at one boundary, null
  // preserved without calling BigInt(null).
  return {
    registrationDate: findings.registrationTimestamp,
    subnameCount: findings.subnameCount,
    textRecordCount: findings.textRecordKeys.length,
    lastRecordUpdateBlock:
      findings.lastUpdateBlock !== null ? BigInt(findings.lastUpdateBlock) : null,
  };
}

function mapEnsResult(result: AgentResult<unknown>): EnsInternalEvidence {
  if (result.status === 'error') return { kind: 'error' };
  if (!isEnsFindings(result.findings)) return { kind: 'error' };
  // status='partial' is emitted for "unregistered name" (subgraph
  // returned no domain row) and "subgraph errored but RPC succeeded".
  // Both surface here as 'absent' so ensRecency short-circuits to
  // null_no_data rather than treating bare resolver-only evidence
  // as real signal.
  if (result.status === 'partial') return { kind: 'absent' };
  return { kind: 'ok', value: toEnsInternalSignals(result.findings) };
}

export function adaptAgentResultsToEvidence(
  agentResults: ReadonlyArray<AgentResult<unknown>>,
): MultiSourceEvidence {
  const sourcify: SourcifyEntryEvidence[] = [];
  let github: GithubEvidence = { kind: 'absent' };
  const onchain: OnchainEntryEvidence[] = [];
  let ensInternal: EnsInternalEvidence = { kind: 'absent' };
  for (const result of agentResults) {
    if (result.agentId === SOURCIFY_AGENT_ID) {
      sourcify.push(...mapSourcifyResult(result));
    } else if (result.agentId === GITHUB_AGENT_ID) {
      github = mapGithubResult(result);
    } else if (result.agentId === ETHEREUM_AGENT_ID) {
      const entry = mapEthereumResult(result);
      if (entry !== null) onchain.push(entry);
    } else if (result.agentId === ENS_AGENT_ID) {
      ensInternal = mapEnsResult(result);
    }
  }
  return {
    subject: { mode: 'manifest', manifest: null },
    sourcify,
    github,
    onchain,
    ensInternal,
  };
}
