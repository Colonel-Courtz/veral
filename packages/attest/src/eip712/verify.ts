import { recoverTypedDataAddress } from 'viem';

import { buildVeralCertTypedData, type VeralCertMessage } from './typed-data';

export type VerifyCertFailureReason = 'malformed_signature' | 'signer_mismatch' | 'recovery_failed';

export interface VerifyCertOk {
  readonly valid: true;
  readonly recovered: `0x${string}`;
}

export interface VerifyCertFail {
  readonly valid: false;
  readonly reason: VerifyCertFailureReason;
  readonly message: string;
  readonly recovered?: `0x${string}`;
}

export type VerifyCertResult = VerifyCertOk | VerifyCertFail;

const SIGNATURE_RE = /^0x[a-fA-F0-9]{130}$/;

function addressesEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export async function verifyVeralCert(
  message: VeralCertMessage,
  signature: `0x${string}`,
  chainId: number,
  expectedSigner: `0x${string}`,
): Promise<VerifyCertResult> {
  if (!SIGNATURE_RE.test(signature)) {
    return {
      valid: false,
      reason: 'malformed_signature',
      message: `signature is not a 65-byte hex string (got length ${signature.length})`,
    };
  }

  const typedData = buildVeralCertTypedData(message, chainId);

  let recovered: `0x${string}`;
  try {
    recovered = await recoverTypedDataAddress({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
      signature,
    });
  } catch (err) {
    return {
      valid: false,
      reason: 'recovery_failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (!addressesEqual(recovered, expectedSigner)) {
    return {
      valid: false,
      reason: 'signer_mismatch',
      message: `recovered signer ${recovered} != expected ${expectedSigner}`,
      recovered,
    };
  }

  return { valid: true, recovered };
}
