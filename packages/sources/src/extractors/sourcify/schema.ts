import { z } from 'zod';

export const sourcifyMatchLevelSchema = z.enum(['exact_match', 'match', 'not_found']);
export type SourcifyMatchLevel = z.infer<typeof sourcifyMatchLevelSchema>;

const addressSchema = z.custom<`0x${string}`>(
  (v) => typeof v === 'string' && /^0x[a-f0-9]{40}$/.test(v),
  'address must be lowercase 0x-prefixed 20 bytes',
);

export const sourcifyContractFindingSchema = z.object({
  chainId: z.number().int().positive(),
  address: addressSchema,
  match: sourcifyMatchLevelSchema,
  compilerVersion: z.string().min(1).nullable(),
  language: z.string().min(1).nullable(),
  contractName: z.string().min(1).nullable(),
});

export type SourcifyContractFinding = z.infer<typeof sourcifyContractFindingSchema>;

// trust: 'verified' is structural — Sourcify ships bytecode-level match
// proofs, so this source is a ×1.0 seniority factor in the score formula.
export const sourcifyFindingsSchema = z.object({
  trust: z.literal('verified'),
  contracts: z.array(sourcifyContractFindingSchema),
  verifiedCount: z.number().int().min(0),
  partialCount: z.number().int().min(0),
  notFoundCount: z.number().int().min(0),
});

export type SourcifyFindings = z.infer<typeof sourcifyFindingsSchema>;
