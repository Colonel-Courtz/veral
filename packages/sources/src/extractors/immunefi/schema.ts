import { z } from 'zod';

export const IMMUNEFI_TRUST_FACTOR = 0.6;
export const IMMUNEFI_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

export const immunefiPayoutHistorySchema = z.object({
  totalPaidMetricEnabled: z.boolean(),
  totalPaidUsd: z.number().nonnegative().nullable(),
  responseTimeMetricEnabled: z.boolean(),
  medianResponseTimeMinutes: z.number().nonnegative().nullable(),
});

export const immunefiSeverityTierSchema = z.object({
  assetType: z.string().min(1),
  severity: z.string().min(1),
  maxRewardUsd: z.number().nonnegative().nullable(),
  minRewardUsd: z.number().nonnegative().nullable(),
  rewardModel: z.string().min(1).nullable(),
  rewardCalculationPercentage: z.number().nonnegative().nullable(),
});

export const immunefiProgramSummarySchema = z.object({
  slug: z.string().min(1),
  project: z.string().min(1),
  url: z.string().min(1),
  launchedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  maxBountyUsd: z.number().nonnegative().nullable(),
  kycRequired: z.boolean(),
  inviteOnly: z.boolean(),
  immunefiStandard: z.boolean(),
  premiumTriaging: z.boolean(),
  safeHarborActive: z.boolean(),
  tags: z.record(z.array(z.string())),
  payoutHistory: immunefiPayoutHistorySchema,
});

export const immunefiProgramDetailSchema = immunefiProgramSummarySchema.extend({
  rewardsToken: z.string().nullable(),
  rewardsTokenNetwork: z.string().nullable(),
  severityTiers: z.array(immunefiSeverityTierSchema),
  impactCount: z.number().int().nonnegative(),
});

export const immunefiDetailErrorSchema = z.object({
  slug: z.string().min(1),
  message: z.string().min(1),
});

export const immunefiFindingsSchema = z.object({
  source: z.object({
    baseUrl: z.literal('https://immunefi.com'),
    bugBountyUrl: z.literal('https://immunefi.com/bug-bounty/'),
    fetchedAt: z.number().int().nonnegative(),
  }),
  trustFactor: z.literal(IMMUNEFI_TRUST_FACTOR),
  cacheTtlSeconds: z.literal(IMMUNEFI_CACHE_TTL_SECONDS),
  activeProgramCount: z.number().int().nonnegative(),
  activePrograms: z.array(immunefiProgramSummarySchema),
  matchedPrograms: z.array(immunefiProgramDetailSchema),
  detailErrors: z.array(immunefiDetailErrorSchema),
});

export type ImmunefiPayoutHistory = z.infer<typeof immunefiPayoutHistorySchema>;
export type ImmunefiSeverityTier = z.infer<typeof immunefiSeverityTierSchema>;
export type ImmunefiProgramSummary = z.infer<typeof immunefiProgramSummarySchema>;
export type ImmunefiProgramDetail = z.infer<typeof immunefiProgramDetailSchema>;
export type ImmunefiFindings = z.infer<typeof immunefiFindingsSchema>;
