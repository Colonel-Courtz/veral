import { orchestrate } from '@veral/authority';
import { resolveSubject } from '@veral/core';
import { computeForVersion } from '@veral/score';
import type { AgentResult, AgentStatus, ScoreResult, SubjectManifest } from '@veral/shared';
import { SubjectResolutionError, SubjectResolverConfigError, VeralError } from '@veral/shared';

import { adaptAgentResultsToEvidence } from './score-adapter';

const ENS_NAME_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]+$/i;

// AgentResult does not currently carry a `domain` field; the registry
// does. Until that surface is widened (tracked as a separate tech-debt
// follow-up), the rollup derives the domain from agentId via this
// static lookup. Unknown ids fall back to agentId-as-domain rather
// than throw — a misregistered agent should still appear in the UI
// instead of crashing the page.
const AGENT_DOMAIN_BY_ID: Readonly<Record<string, string>> = {
  'sourcify-extract': 'sourcify',
  'github-extract': 'github',
  'ethereum-extract': 'ethereum',
  'ens-extract': 'ens-internal',
  'eas-extract': 'eas',
};

function domainForAgentId(agentId: string): string {
  return AGENT_DOMAIN_BY_ID[agentId] ?? agentId;
}

export type BenchHandlerErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'BAD_GATEWAY'
  | 'INTERNAL';

export class BenchHandlerError extends Error {
  readonly status: number;
  readonly code: BenchHandlerErrorCode;
  constructor(status: number, code: BenchHandlerErrorCode, message: string) {
    super(message);
    this.name = 'BenchHandlerError';
    this.status = status;
    this.code = code;
  }
}

export interface BenchHandlerDeps {
  readonly resolveSubject?: (ensName: string) => Promise<SubjectManifest>;
  readonly orchestrate?: typeof orchestrate;
  readonly now?: () => number;
  readonly runUuid?: () => string;
}

export interface AgentRollupEntry {
  readonly agentId: string;
  readonly domain: string;
  readonly status: AgentStatus;
}

export interface BenchScoreResult {
  readonly score: ScoreResult;
  readonly agentRollup: ReadonlyArray<AgentRollupEntry>;
}

function nowSecondsDefault(): number {
  return Math.floor(Date.now() / 1000);
}

function defaultRunUuid(): string {
  return crypto.randomUUID();
}

function validateEnsName(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 253 || !ENS_NAME_RE.test(trimmed)) {
    throw new BenchHandlerError(400, 'BAD_REQUEST', `invalid ENS name: ${raw}`);
  }
  return trimmed;
}

function toRollupEntry(result: AgentResult<unknown>): AgentRollupEntry {
  return {
    agentId: result.agentId,
    domain: domainForAgentId(result.agentId),
    status: result.status,
  };
}

async function resolveSubjectOrThrow(
  resolve: (ensName: string) => Promise<SubjectManifest>,
  ensName: string,
): Promise<SubjectManifest> {
  try {
    return await resolve(ensName);
  } catch (err) {
    // Config errors come first so a misconfigured resolver (e.g.
    // missing RPC URL env var) surfaces as 503 instead of misleading
    // the user with a 404 "subject not resolveable" response.
    if (err instanceof SubjectResolverConfigError) {
      throw new BenchHandlerError(503, 'SERVICE_UNAVAILABLE', err.message);
    }
    if (err instanceof SubjectResolutionError) {
      throw new BenchHandlerError(404, 'NOT_FOUND', err.message);
    }
    if (err instanceof VeralError) {
      throw new BenchHandlerError(502, 'BAD_GATEWAY', err.message);
    }
    throw new BenchHandlerError(500, 'INTERNAL', err instanceof Error ? err.message : String(err));
  }
}

async function orchestrateOrThrow(
  run: typeof orchestrate,
  subject: SubjectManifest,
  runUuid: string,
): Promise<Awaited<ReturnType<typeof orchestrate>>> {
  try {
    return await run({ subject, tier: 'Public', runUuid });
  } catch (err) {
    throw new BenchHandlerError(
      502,
      'BAD_GATEWAY',
      `orchestrator failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function computeBenchScore(
  rawName: string,
  deps: BenchHandlerDeps = {},
): Promise<BenchScoreResult> {
  const ensName = validateEnsName(rawName);
  const resolve = deps.resolveSubject ?? resolveSubject;
  const run = deps.orchestrate ?? orchestrate;
  const now = deps.now ?? nowSecondsDefault;
  const uuid = deps.runUuid ?? defaultRunUuid;

  const subject = await resolveSubjectOrThrow(resolve, ensName);
  const orchestrationOutput = await orchestrateOrThrow(run, subject, uuid());

  // Rollup is captured BEFORE the score-adapter so the per-agent status
  // is preserved even for agents the adapter does not yet drain into
  // MultiSourceEvidence — the UI still surfaces every agent that ran.
  const agentRollup = orchestrationOutput.agentResults.map(toRollupEntry);

  const evidence = adaptAgentResultsToEvidence(orchestrationOutput.agentResults);
  const computedAt = now();
  const score = computeForVersion('v1.0')(evidence, {
    nowSeconds: computedAt,
    subjectNamehash: subject.namehash,
    tier: 'Public',
    computedAt,
  });
  return { score, agentRollup };
}
