import { z } from 'zod';

const addressSchema = z.custom<`0x${string}`>(
  (v) => typeof v === 'string' && /^0x[a-f0-9]{40}$/.test(v),
  'address must be lowercase 0x-prefixed 20 bytes',
);

const schemaUidSchema = z.custom<`0x${string}`>(
  (v) => typeof v === 'string' && /^0x[a-f0-9]{64}$/.test(v),
  'schemaUid must be lowercase 0x-prefixed 32 bytes',
);

// Issuer-category taxonomy — drives UI explainability ("verified by
// Coinbase + 2 RetroPGF attestations") and lets the eventual score
// component weight categories differently if Veral chooses to. The
// list is exhaustive on purpose: an unrecognised category should be
// classified, not silently downgraded.
export const TRUSTED_ISSUER_CATEGORIES = [
  'kyc',
  'governance',
  'grant',
  'developer',
  'social',
] as const;
export type TrustedIssuerCategory = (typeof TRUSTED_ISSUER_CATEGORIES)[number];

export interface TrustedIssuer {
  readonly issuer: `0x${string}`;
  readonly schemaUid: `0x${string}`;
  readonly chainId: number;
  readonly name: string;
  readonly category: TrustedIssuerCategory;
  // 0..1, contribution multiplier the score component may apply when
  // counting this category-of-attestation. v1.0 ignores it (treats all
  // matched trusted attestations equally); kept on the contract so the
  // curated list in the follow-up PR can be authored once.
  readonly weight: number;
}

export const easIssuerHitSchema = z.object({
  issuerName: z.string().min(1),
  category: z.enum(TRUSTED_ISSUER_CATEGORIES),
  count: z.number().int().min(0),
  latestTimestamp: z.number().int().min(0),
});

export type EasIssuerHit = z.infer<typeof easIssuerHitSchema>;

// trust: 'verified' is structural — every attestation is an onchain
// signature from the attester, indexed deterministically by the EAS
// schema registry. Score formula consumes EAS at full weight (no
// ×0.6 unverified discount).
//
// recipient is always lowercased at the boundary so cache keys and
// canonical-JSON provenance hashes stay stable across casing variants.
export const easFindingsSchema = z.object({
  trust: z.literal('verified'),
  chainId: z.number().int().min(1),
  recipient: addressSchema,
  attestationCount: z.number().int().min(0),
  // true when the recipient-broad query hit the 100-row cap; consumers
  // should treat attestationCount as a lower bound rather than exact.
  attestationsCapped: z.boolean(),
  trustedAttestationCount: z.number().int().min(0),
  trustedIssuerHits: z.array(easIssuerHitSchema),
  callBudget: z.number().int().min(0),
});

export type EasFindings = z.infer<typeof easFindingsSchema>;

export { addressSchema as easAddressSchema, schemaUidSchema as easSchemaUidSchema };
