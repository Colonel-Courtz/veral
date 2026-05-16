import type { TrustedIssuer } from './schema';

// Curation of trusted-issuer records is a product decision, not
// engineering — researched in a follow-up PR with easscan.org URLs as
// citations per entry. Until that PR lands, every attestation surfaces
// as untrusted; the read mechanism still produces a valid
// attestationCount signal, and trustedAttestationCount stays at 0.
//
// Candidates to seed (researched separately, do not invent addresses):
//   Coinbase Verifications (kyc) on mainnet
//   Optimism Foundation RetroPGF (governance) on Optimism
//   Karma GAP (grant) on Optimism + Base
//   Talent Protocol Builder Score (developer) on Base
//   Devcon ticket attestations (social) on mainnet
export const DEFAULT_TRUSTED_ISSUERS: ReadonlyArray<TrustedIssuer> = [];
