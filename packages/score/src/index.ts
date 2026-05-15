import { computeScore as computeScoreV1_0 } from './versions/v1.0/engine';

export const SCORE_PACKAGE_VERSIONS = ['v1.0'] as const;
export type ScoreEngineVersion = (typeof SCORE_PACKAGE_VERSIONS)[number];

export function computeForVersion(version: ScoreEngineVersion): typeof computeScoreV1_0 {
  if (version === 'v1.0') return computeScoreV1_0;
  throw new Error(`Unknown score engine version: ${version satisfies never}`);
}
