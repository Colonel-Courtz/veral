import type { TypedData, TypedDataDomain } from 'viem';

export const VERAL_CERT_DOMAIN_NAME = 'Veral' as const;
export const VERAL_CERT_DOMAIN_VERSION = '1' as const;
export const VERAL_CERT_PRIMARY_TYPE = 'VeralCert' as const;

export const ZERO_ADDRESS: `0x${string}` = `0x${'0'.repeat(40)}` as `0x${string}`;
export const ZERO_BYTES32: `0x${string}` = `0x${'0'.repeat(64)}` as `0x${string}`;

export const TIER_CODE = { Public: 0, Anchored: 1, Sealed: 2 } as const;
export type TierCode = (typeof TIER_CODE)[keyof typeof TIER_CODE];

// Fields mirror the EAS schema in packages/attest/AGENTS.md so the operator
// signature binds the same bytes the on-chain attestation publishes.
export const VERAL_CERT_TYPED_DATA_TYPES = {
  VeralCert: [
    { name: 'subjectNamehash', type: 'bytes32' },
    { name: 'subjectEnsName', type: 'string' },
    { name: 'tier', type: 'uint8' },
    { name: 'score', type: 'uint16' },
    { name: 'scoreFormulaVersion', type: 'string' },
    { name: 'issuedAt', type: 'uint64' },
    { name: 'validUntil', type: 'uint64' },
    { name: 'evidenceBundleHash', type: 'bytes32' },
    { name: 'aiProvenanceHash', type: 'bytes32' },
    { name: 'forensicHash', type: 'bytes32' },
    { name: 'signer', type: 'address' },
    { name: 'previousUID', type: 'bytes32' },
  ],
} as const satisfies TypedData;

export type VeralCertTypedDataTypes = typeof VERAL_CERT_TYPED_DATA_TYPES;

export interface VeralCertMessage {
  readonly subjectNamehash: `0x${string}`;
  readonly subjectEnsName: string;
  readonly tier: TierCode;
  readonly score: number;
  readonly scoreFormulaVersion: string;
  readonly issuedAt: bigint;
  readonly validUntil: bigint;
  readonly evidenceBundleHash: `0x${string}`;
  readonly aiProvenanceHash: `0x${string}`;
  readonly forensicHash: `0x${string}`;
  readonly signer: `0x${string}`;
  readonly previousUID: `0x${string}`;
}

export interface VeralCertTypedData {
  readonly domain: TypedDataDomain;
  readonly types: VeralCertTypedDataTypes;
  readonly primaryType: typeof VERAL_CERT_PRIMARY_TYPE;
  readonly message: VeralCertMessage;
}

export function buildVeralCertDomain(chainId: number): TypedDataDomain {
  return {
    name: VERAL_CERT_DOMAIN_NAME,
    version: VERAL_CERT_DOMAIN_VERSION,
    chainId,
    verifyingContract: ZERO_ADDRESS,
  };
}

export function buildVeralCertTypedData(
  message: VeralCertMessage,
  chainId: number,
): VeralCertTypedData {
  return {
    domain: buildVeralCertDomain(chainId),
    types: VERAL_CERT_TYPED_DATA_TYPES,
    primaryType: VERAL_CERT_PRIMARY_TYPE,
    message,
  };
}
