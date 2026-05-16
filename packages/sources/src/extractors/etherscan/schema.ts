import { z } from 'zod';

const addressSchema = z.custom<`0x${string}`>(
  (v) => typeof v === 'string' && /^0x[a-f0-9]{40}$/.test(v),
  'address must be lowercase 0x-prefixed 20 bytes',
);

export const etherscanContractFindingSchema = z.object({
  chainId: z.number().int().positive(),
  address: addressSchema,
  etherscanVerified: z.boolean(),
  compilerVersion: z.string().min(1).nullable(),
  contractName: z.string().min(1).nullable(),
  hasProxy: z.boolean(),
});

export type EtherscanContractFinding = z.infer<typeof etherscanContractFindingSchema>;

// trust: 'unverified' is structural. Etherscan is a centralised API
// (a single company controls the verification database, can revoke
// entries, and gates access behind an API key), so the score formula
// applies the ×0.6 unverified discount to anything sourced here. Use
// this agent as a cross-check signal against Sourcify rather than as
// a primary verification of record.
export const etherscanFindingsSchema = z.object({
  trust: z.literal('unverified'),
  contracts: z.array(etherscanContractFindingSchema),
  verifiedCount: z.number().int().min(0),
  callBudget: z.number().int().min(0),
});

export type EtherscanFindings = z.infer<typeof etherscanFindingsSchema>;
