import type { TierKey } from '../tiers/index';

export interface IssuanceInput {
  readonly requestId: string;
  readonly subjectNamehash: `0x${string}`;
  readonly subjectEnsName: string;
  readonly tier: TierKey;
  readonly score: number;
  readonly scoreFormulaVersion: string;
  readonly evidenceBundleHash: string;
  readonly aiProvenanceHash: string | null;
  readonly forensicHash: string | null;
  readonly previousUid: string | null;
  readonly validityDays: 365;
  readonly agentsTotal: number;
  readonly agentsSucceeded: number;
}

export type IssuanceFailureReason =
  | 'attestation_revert'
  | 'rpc_unavailable'
  | 'schema_mismatch'
  | 'signer_unauthorized'
  | 'manifest_signer_unverified';

export interface IssuanceOk {
  readonly ok: true;
  readonly requestId: string;
  readonly certUid: string;
  readonly schemaUid: string;
  readonly chainId: number;
  readonly signer: `0x${string}`;
  readonly issuedAt: number;
  readonly validUntil: number;
}

export interface IssuanceFail {
  readonly ok: false;
  readonly requestId: string;
  readonly reason: IssuanceFailureReason;
  readonly detail: string;
}

export type IssuanceResult = IssuanceOk | IssuanceFail;
