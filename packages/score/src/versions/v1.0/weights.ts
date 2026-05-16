export const TRUST_DISCOUNT_UNVERIFIED = 0.6;
export const TRUST_DISCOUNT_VERIFIED = 1.0;

export type TrustLabel = 'verified' | 'unverified';

export interface WeightedComponent {
  readonly weight: number;
  readonly trust: TrustLabel;
}

export const SENIORITY_WEIGHTS = {
  compileSuccess: { weight: 0.25, trust: 'verified' },
  ciPassRate: { weight: 0.2, trust: 'unverified' },
  testPresence: { weight: 0.15, trust: 'unverified' },
  bugHygiene: { weight: 0.1, trust: 'unverified' },
  repoHygiene: { weight: 0.15, trust: 'unverified' },
  releaseCadence: { weight: 0.15, trust: 'unverified' },
} as const satisfies Record<string, WeightedComponent>;

export type SeniorityComponentId = keyof typeof SENIORITY_WEIGHTS;

export const RELEVANCE_WEIGHTS = {
  sourcifyRecency: { weight: 0.3, trust: 'verified' },
  githubRecency: { weight: 0.3, trust: 'unverified' },
  onchainRecency: { weight: 0.25, trust: 'verified' },
  ensRecency: { weight: 0.15, trust: 'verified' },
} as const satisfies Record<string, WeightedComponent>;

export type RelevanceComponentId = keyof typeof RELEVANCE_WEIGHTS;

export const AXIS_WEIGHTS = {
  seniority: 0.5,
  relevance: 0.5,
} as const;

export function trustFactor(label: TrustLabel): number {
  return label === 'verified' ? TRUST_DISCOUNT_VERIFIED : TRUST_DISCOUNT_UNVERIFIED;
}
