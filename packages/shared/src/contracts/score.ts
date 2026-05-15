import type { TierKey } from '../tiers/index.js';

export type ScoreFormulaVersion = `v${number}.${number}.${number}`;

export interface ScoreComponent {
  readonly domain: string;
  readonly weight: number;
  readonly rawValue: number;
  readonly contribution: number;
  readonly trustDiscount: number;
}

export interface ScoreResult {
  readonly subjectNamehash: `0x${string}`;
  readonly tier: TierKey;
  readonly score: number;
  readonly formulaVersion: ScoreFormulaVersion;
  readonly components: ReadonlyArray<ScoreComponent>;
  readonly computedAt: number;
}
