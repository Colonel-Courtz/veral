export const SCORE_PACKAGE_VERSIONS = ['v1.0'] as const;
export type ScoreFormulaVersion = (typeof SCORE_PACKAGE_VERSIONS)[number];
