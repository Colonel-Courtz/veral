import type { ScoreComponent, ScoreResult, TierKey } from '@veral/shared';

import {
  bugHygiene,
  ciPassRate,
  compileSuccess,
  ensRecency,
  githubRecency,
  onchainRecency,
  releaseCadence,
  repoHygiene,
  sourcifyRecency,
  testPresence,
} from './components';
import type { ComponentValue, MultiSourceEvidence } from './evidence-types';
import {
  AXIS_WEIGHTS,
  RELEVANCE_WEIGHTS,
  type RelevanceComponentId,
  SENIORITY_WEIGHTS,
  type SeniorityComponentId,
  trustFactor,
  type WeightedComponent,
} from './weights';

export const SCORE_FORMULA_VERSION = 'v1.0.0' as const;

export interface ComputeScoreOptions {
  // Unix seconds. Required — engine is pure (no Date.now()). Auditors
  // re-derive recency math against this anchor.
  readonly nowSeconds: number;
  readonly subjectNamehash: `0x${string}`;
  // The certificate tier the customer paid for. Echoed in the result
  // for downstream issuance binding; not derived from the score.
  readonly tier: TierKey;
  // Unix seconds of when this run was assembled. Surfaced on the
  // ScoreResult so attestations carry the assembly timestamp.
  readonly computedAt: number;
}

type ComponentExtractor = (evidence: MultiSourceEvidence, nowSeconds: number) => ComponentValue;

// Order is the rendered breakdown order; do not reorder without bumping
// the formula version — auditors re-derive against this sequence.
const SENIORITY_EXTRACTORS: ReadonlyArray<{
  readonly id: SeniorityComponentId;
  readonly domain: string;
  readonly extractor: ComponentExtractor;
}> = [
  { id: 'compileSuccess', domain: 'sourcify', extractor: (e) => compileSuccess(e) },
  { id: 'ciPassRate', domain: 'github', extractor: (e) => ciPassRate(e) },
  { id: 'testPresence', domain: 'github', extractor: (e) => testPresence(e) },
  { id: 'bugHygiene', domain: 'github', extractor: (e) => bugHygiene(e) },
  { id: 'repoHygiene', domain: 'github', extractor: (e) => repoHygiene(e) },
  { id: 'releaseCadence', domain: 'github', extractor: (e) => releaseCadence(e) },
];

const RELEVANCE_EXTRACTORS: ReadonlyArray<{
  readonly id: RelevanceComponentId;
  readonly domain: string;
  readonly extractor: ComponentExtractor;
}> = [
  { id: 'sourcifyRecency', domain: 'sourcify', extractor: (e) => sourcifyRecency(e) },
  { id: 'githubRecency', domain: 'github', extractor: (e, now) => githubRecency(e, now) },
  { id: 'onchainRecency', domain: 'onchain', extractor: (e) => onchainRecency(e) },
  { id: 'ensRecency', domain: 'ens-internal', extractor: (e, now) => ensRecency(e, now) },
];

interface RawBreakdown {
  readonly id: string;
  readonly domain: string;
  readonly spec: WeightedComponent;
  readonly cv: ComponentValue;
  readonly contribution: number;
}

function buildBreakdown(
  id: string,
  domain: string,
  spec: WeightedComponent,
  cv: ComponentValue,
): RawBreakdown {
  const factor = trustFactor(spec.trust);
  const contribution = cv.value === null ? 0 : spec.weight * cv.value * factor;
  return { id, domain, spec, cv, contribution };
}

function axisSum(components: ReadonlyArray<RawBreakdown>): number {
  let sum = 0;
  for (const c of components) sum += c.contribution;
  // Clamp against floating-point drift; the weight tables guarantee 0..1
  // by construction but adversarial test fixtures could feed otherwise.
  return Math.min(Math.max(sum, 0), 1);
}

function toScoreComponent(b: RawBreakdown): ScoreComponent {
  return {
    domain: b.domain,
    weight: b.spec.weight,
    rawValue: b.cv.value ?? 0,
    contribution: b.contribution,
    trustDiscount: trustFactor(b.spec.trust),
  };
}

export function computeScore(
  evidence: MultiSourceEvidence,
  options: ComputeScoreOptions,
): ScoreResult {
  const seniorityBreakdown = SENIORITY_EXTRACTORS.map(({ id, domain, extractor }) =>
    buildBreakdown(id, domain, SENIORITY_WEIGHTS[id], extractor(evidence, options.nowSeconds)),
  );
  const relevanceBreakdown = RELEVANCE_EXTRACTORS.map(({ id, domain, extractor }) =>
    buildBreakdown(id, domain, RELEVANCE_WEIGHTS[id], extractor(evidence, options.nowSeconds)),
  );

  const seniority = axisSum(seniorityBreakdown);
  const relevance = axisSum(relevanceBreakdown);
  const scoreRaw = AXIS_WEIGHTS.seniority * seniority + AXIS_WEIGHTS.relevance * relevance;
  const score = Math.round(scoreRaw * 100);

  return {
    subjectNamehash: options.subjectNamehash,
    tier: options.tier,
    score,
    formulaVersion: SCORE_FORMULA_VERSION,
    components: [...seniorityBreakdown, ...relevanceBreakdown].map(toScoreComponent),
    computedAt: options.computedAt,
  };
}
