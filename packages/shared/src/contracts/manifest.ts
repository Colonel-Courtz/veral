export type ManifestRejectionReason =
  | 'text_record_missing'
  | 'manifest_unreachable'
  | 'manifest_malformed'
  | 'signature_missing'
  | 'signature_invalid'
  | 'signer_mismatch'
  | 'manifest_hash_mismatch';

export interface ManifestVerificationOk {
  readonly ok: true;
  readonly namehash: `0x${string}`;
  readonly manifestHash: string;
  readonly signer: `0x${string}`;
  readonly signerMatchesOwner: boolean;
  readonly verifiedAt: number;
}

export interface ManifestVerificationFail {
  readonly ok: false;
  readonly namehash: `0x${string}`;
  readonly reason: ManifestRejectionReason;
  readonly detail: string;
}

export type ManifestVerificationResult = ManifestVerificationOk | ManifestVerificationFail;
