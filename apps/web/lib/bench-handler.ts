import { orchestrate } from '@veral/authority';
import { resolveSubject } from '@veral/core';
import { computeForVersion } from '@veral/score';
import type { ScoreResult, SubjectManifest } from '@veral/shared';
import { SubjectResolutionError, VeralError } from '@veral/shared';

import { adaptAgentResultsToEvidence } from './score-adapter';

const ENS_NAME_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]+$/i;

export type BenchHandlerErrorCode = 'BAD_REQUEST' | 'NOT_FOUND' | 'BAD_GATEWAY' | 'INTERNAL';

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

export async function computeBenchScore(
  rawName: string,
  deps: BenchHandlerDeps = {},
): Promise<ScoreResult> {
  const ensName = validateEnsName(rawName);
  const resolve = deps.resolveSubject ?? resolveSubject;
  const run = deps.orchestrate ?? orchestrate;
  const now = deps.now ?? nowSecondsDefault;
  const uuid = deps.runUuid ?? defaultRunUuid;

  let subject: SubjectManifest;
  try {
    subject = await resolve(ensName);
  } catch (err) {
    if (err instanceof SubjectResolutionError) {
      throw new BenchHandlerError(404, 'NOT_FOUND', err.message);
    }
    if (err instanceof VeralError) {
      throw new BenchHandlerError(502, 'BAD_GATEWAY', err.message);
    }
    throw new BenchHandlerError(500, 'INTERNAL', err instanceof Error ? err.message : String(err));
  }

  let orchestrationOutput: Awaited<ReturnType<typeof orchestrate>>;
  try {
    orchestrationOutput = await run({
      subject,
      tier: 'Public',
      runUuid: uuid(),
    });
  } catch (err) {
    throw new BenchHandlerError(
      502,
      'BAD_GATEWAY',
      `orchestrator failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const evidence = adaptAgentResultsToEvidence(orchestrationOutput.agentResults);
  const computedAt = now();
  return computeForVersion('v1.0')(evidence, {
    nowSeconds: computedAt,
    subjectNamehash: subject.namehash,
    tier: 'Public',
    computedAt,
  });
}
