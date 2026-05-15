import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  buildVeralCertTypedData,
  type VeralCertMessage,
  type VeralCertTypedData,
} from './typed-data.js';

export const REPORT_SIGNER_PRIVATE_KEY_ENV = 'REPORT_SIGNER_PRIVATE_KEY';

export interface SignCertResult {
  readonly signature: `0x${string}`;
  readonly signer: `0x${string}`;
  readonly typedData: VeralCertTypedData;
}

export interface SignCertOptions {
  readonly privateKey?: Hex;
}

// Reads REPORT_SIGNER_PRIVATE_KEY from env when no override is supplied.
// Throws a typed error if the key is missing or malformed so callers can
// fail-fast at startup rather than emitting an unsigned cert.
function resolvePrivateKey(override?: Hex): Hex {
  if (override) return override;
  const fromEnv = process.env[REPORT_SIGNER_PRIVATE_KEY_ENV];
  if (!fromEnv) {
    throw new Error(`${REPORT_SIGNER_PRIVATE_KEY_ENV} is not set`);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(fromEnv)) {
    throw new Error(`${REPORT_SIGNER_PRIVATE_KEY_ENV} is not a 32-byte hex string`);
  }
  return fromEnv as Hex;
}

export async function signVeralCert(
  message: VeralCertMessage,
  chainId: number,
  options: SignCertOptions = {},
): Promise<SignCertResult> {
  const privateKey = resolvePrivateKey(options.privateKey);
  const account = privateKeyToAccount(privateKey);

  if (message.signer.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(
      `signVeralCert: message.signer ${message.signer} does not match signing account ${account.address}`,
    );
  }

  const typedData = buildVeralCertTypedData(message, chainId);
  const signature = await account.signTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  return {
    signature,
    signer: account.address,
    typedData,
  };
}
