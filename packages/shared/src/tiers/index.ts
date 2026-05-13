export const TIER_KEYS = ['Public', 'Anchored', 'Sealed'] as const;
export type TierKey = (typeof TIER_KEYS)[number];

export interface TierConfig {
  readonly key: TierKey;
  readonly priceUsdMin: number;
  readonly priceUsdMax: number;
  readonly methodology: 'deterministic' | 'ai-augmented' | 'forensic';
  readonly validityDays: 365;
}

export const TIER_CONFIG: Record<TierKey, TierConfig> = {
  Public: {
    key: 'Public',
    priceUsdMin: 0.5,
    priceUsdMax: 2,
    methodology: 'deterministic',
    validityDays: 365,
  },
  Anchored: {
    key: 'Anchored',
    priceUsdMin: 5,
    priceUsdMax: 20,
    methodology: 'ai-augmented',
    validityDays: 365,
  },
  Sealed: {
    key: 'Sealed',
    priceUsdMin: 50,
    priceUsdMax: 500,
    methodology: 'forensic',
    validityDays: 365,
  },
};

export function isTierKey(value: unknown): value is TierKey {
  return typeof value === 'string' && (TIER_KEYS as readonly string[]).includes(value);
}
