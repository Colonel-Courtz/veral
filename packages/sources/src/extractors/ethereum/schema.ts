import { z } from 'zod';

const addressSchema = z.custom<`0x${string}`>(
  (v) => typeof v === 'string' && /^0x[a-f0-9]{40}$/.test(v),
  'address must be lowercase 0x-prefixed 20 bytes',
);

// trust: 'verified' is structural — RPC reads come directly from the
// chain. Score formula applies ×1.0 (no trust discount) to anything
// sourced here.
//
// Block numbers are typed as number rather than bigint so the findings
// payload is JSON-safe for the Upstash cache and the canonical-JSON
// provenance hash. Mainnet head (~25M) sits well below Number.MAX_SAFE_INTEGER.
export const ethereumFindingsSchema = z.object({
  trust: z.literal('verified'),
  chainId: z.number().int().positive(),
  address: addressSchema,
  nonce: z.number().int().min(0),
  firstTxBlock: z.number().int().min(0).nullable(),
  firstTxTimestamp: z.number().int().min(0).nullable(),
  latestBlock: z.number().int().min(0),
  // Indexer-backed signals are not wired in v1; null means "data
  // unavailable" rather than 0. The score engine's onchainRecency
  // falls back to nonce/cap-1000 when this is null.
  transferCountRecent90d: z.number().int().min(0).nullable(),
  transferCountProvider: z.string().nullable(),
  // Deployed-contract count requires a Sourcify deployer-crosswalk or
  // an Alchemy-side trace API call. Out of scope for v1; default 0.
  deployedContractCount: z.number().int().min(0),
});

export type EthereumFindings = z.infer<typeof ethereumFindingsSchema>;
