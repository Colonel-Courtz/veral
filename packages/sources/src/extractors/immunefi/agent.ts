import { createHash } from 'node:crypto';
import type { AgentInput, AgentProvenance, AgentResult, SourceAgent } from '@veral/shared';
import {
  defaultImmunefiHttpClient,
  fetchActiveImmunefiPrograms,
  fetchImmunefiProgramDetail,
  IMMUNEFI_BASE_URL,
  IMMUNEFI_BUG_BOUNTY_URL,
  type ImmunefiHttpClient,
} from './client.js';
import {
  IMMUNEFI_CACHE_TTL_SECONDS,
  IMMUNEFI_TRUST_FACTOR,
  type ImmunefiFindings,
  type ImmunefiProgramDetail,
  type ImmunefiProgramSummary,
  immunefiFindingsSchema,
} from './schema.js';

export const IMMUNEFI_AGENT_ID = 'immunefi-extract';
export const IMMUNEFI_AGENT_VERSION = '0.1.0';
export const IMMUNEFI_DETAIL_LIMIT = 3;

export interface ImmunefiAgentOptions {
  readonly client?: ImmunefiHttpClient;
  readonly detailLimit?: number;
}

/**
 * Rate limit budget: one listing page plus bounded matched-program detail pages per run.
 * Recommended cache TTL: seven days.
 */
export function createImmunefiAgent(
  options: ImmunefiAgentOptions = {},
): SourceAgent<ImmunefiFindings> {
  const client = options.client ?? defaultImmunefiHttpClient;
  const detailLimit = options.detailLimit ?? IMMUNEFI_DETAIL_LIMIT;
  return {
    id: IMMUNEFI_AGENT_ID,
    version: IMMUNEFI_AGENT_VERSION,
    domain: 'immunefi',
    tierApplicability: ['Public', 'Anchored', 'Sealed'],
    schema: immunefiFindingsSchema,
    async run(input: AgentInput): Promise<AgentResult<ImmunefiFindings>> {
      const runStartedAt = Date.now();
      try {
        const activePrograms = await fetchActiveImmunefiPrograms(client);
        const matchedSummaries = findSubjectProgramMatches(input.subject, activePrograms).slice(
          0,
          detailLimit,
        );
        const detailResults = await fetchMatchedProgramDetails(matchedSummaries, client);
        const findings = immunefiFindingsSchema.parse({
          source: {
            baseUrl: IMMUNEFI_BASE_URL,
            bugBountyUrl: IMMUNEFI_BUG_BOUNTY_URL,
            fetchedAt: Date.now(),
          },
          trustFactor: IMMUNEFI_TRUST_FACTOR,
          cacheTtlSeconds: IMMUNEFI_CACHE_TTL_SECONDS,
          activeProgramCount: activePrograms.length,
          activePrograms,
          matchedPrograms: detailResults.programs,
          detailErrors: detailResults.errors,
        });
        return {
          agentId: IMMUNEFI_AGENT_ID,
          agentVersion: IMMUNEFI_AGENT_VERSION,
          runUuid: input.runUuid,
          runStartedAt,
          runFinishedAt: Date.now(),
          status: detailResults.errors.length > 0 ? 'partial' : 'ok',
          findings,
          provenance: buildImmunefiProvenance(input, findings, detailResults.errors),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Immunefi extractor error';
        return {
          agentId: IMMUNEFI_AGENT_ID,
          agentVersion: IMMUNEFI_AGENT_VERSION,
          runUuid: input.runUuid,
          runStartedAt,
          runFinishedAt: Date.now(),
          status: 'error',
          findings: null,
          provenance: buildErrorProvenance(input, message),
        };
      }
    },
  };
}

export const immunefiAgent = createImmunefiAgent();

export function findSubjectProgramMatches(
  subject: AgentInput['subject'],
  programs: ReadonlyArray<ImmunefiProgramSummary>,
): ReadonlyArray<ImmunefiProgramSummary> {
  const candidates = normalizedSubjectCandidates(subject);
  if (candidates.length === 0) return [];
  return programs.filter((program) => {
    const programTokens = [normalizeToken(program.slug), normalizeToken(program.project)].filter(
      (token) => token.length >= 4,
    );
    return programTokens.some((programToken) =>
      candidates.some(
        (candidate) =>
          candidate === programToken ||
          candidate.includes(programToken) ||
          programToken.includes(candidate),
      ),
    );
  });
}

async function fetchMatchedProgramDetails(
  summaries: ReadonlyArray<ImmunefiProgramSummary>,
  client: ImmunefiHttpClient,
): Promise<{
  readonly programs: ReadonlyArray<ImmunefiProgramDetail>;
  readonly errors: ReadonlyArray<{ readonly slug: string; readonly message: string }>;
}> {
  const programs: ImmunefiProgramDetail[] = [];
  const errors: Array<{ readonly slug: string; readonly message: string }> = [];
  for (const summary of summaries) {
    try {
      programs.push(await fetchImmunefiProgramDetail(summary.slug, client));
    } catch (error) {
      errors.push({
        slug: summary.slug,
        message: error instanceof Error ? error.message : 'Unknown Immunefi detail error',
      });
    }
  }
  return { programs, errors };
}

function normalizedSubjectCandidates(subject: AgentInput['subject']): string[] {
  const values = [
    subject.ensName,
    subject.declaredSources.github?.owner,
    subject.declaredSources.ensInternal.rootName,
    ensRootLabel(subject.ensName),
    ensRootLabel(subject.declaredSources.ensInternal.rootName),
  ];
  const normalized = values
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => normalizedVariants(value))
    .filter((value) => value.length >= 4);
  return Array.from(new Set(normalized));
}

function normalizedVariants(value: string): string[] {
  const token = normalizeToken(value);
  const withoutCommonSuffix = token.replace(
    /(protocol|finance|network|foundation|labs|dao|app)$/,
    '',
  );
  return withoutCommonSuffix.length >= 4 && withoutCommonSuffix !== token
    ? [token, withoutCommonSuffix]
    : [token];
}

function ensRootLabel(value: string | undefined): string | undefined {
  return value?.split('.').find((part) => part.length > 0);
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildImmunefiProvenance(
  input: AgentInput,
  findings: ImmunefiFindings,
  detailErrors: ReadonlyArray<{ readonly slug: string; readonly message: string }>,
): AgentProvenance {
  const base = {
    backend: {
      kind: 'rest-api' as const,
      baseUrl: IMMUNEFI_BASE_URL,
      version: 'next-flight-public-pages',
    },
    inputHash: hashCanonical({
      subject: input.subject,
      activeProgramCount: findings.activeProgramCount,
      matchedProgramSlugs: findings.matchedPrograms.map((program) => program.slug),
    }),
  };
  if (detailErrors.length === 0) return base;
  return {
    ...base,
    errorMessage: detailErrors.map((error) => `${error.slug}: ${error.message}`).join('; '),
  };
}

function buildErrorProvenance(input: AgentInput, errorMessage: string): AgentProvenance {
  return {
    backend: {
      kind: 'rest-api',
      baseUrl: IMMUNEFI_BASE_URL,
      version: 'next-flight-public-pages',
    },
    inputHash: hashCanonical({ subject: input.subject, source: IMMUNEFI_BUG_BOUNTY_URL }),
    errorMessage,
  };
}

function hashCanonical(value: unknown): string {
  return `0x${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
