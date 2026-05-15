import type { ManifestVerificationResult } from '@veral/shared';
import { canonicalJson } from '@veral/shared';
import {
  keccak256,
  recoverTypedDataAddress,
  stringToHex,
  type TypedData,
  type TypedDataDomain,
} from 'viem';
import { namehash } from 'viem/ens';

import type { ParsedManifest } from './manifest-parse.js';

export const VERAL_MANIFEST_DOMAIN_NAME = 'Veral' as const;
export const VERAL_MANIFEST_DOMAIN_VERSION = '1' as const;
export const VERAL_MANIFEST_PRIMARY_TYPE = 'VeralManifest' as const;
export const VERAL_MANIFEST_DOMAIN_CHAIN_ID = 1 as const;

export const VERAL_MANIFEST_DOMAIN: TypedDataDomain = {
  name: VERAL_MANIFEST_DOMAIN_NAME,
  version: VERAL_MANIFEST_DOMAIN_VERSION,
  chainId: VERAL_MANIFEST_DOMAIN_CHAIN_ID,
};

// Manifest typed-data binds the same per-field hashes the cert binds for
// declared sources — that way a verifier reading the cert can recompute
// the manifest's declaredSourcesHash from the same canonicalJson rule.
export const VERAL_MANIFEST_TYPES = {
  VeralManifest: [
    { name: 'ensName', type: 'string' },
    { name: 'kind', type: 'string' },
    { name: 'declaredSourcesHash', type: 'bytes32' },
    { name: 'signedAt', type: 'string' },
  ],
} as const satisfies TypedData;

const SIGNATURE_RE = /^0x[a-fA-F0-9]{130}$/;

function isAddress(x: string): x is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(x);
}

function declaredSourcesHash(manifest: ParsedManifest): `0x${string}` {
  return keccak256(stringToHex(canonicalJson(manifest.declaredSources)));
}

function buildVerifiedAt(now?: () => number): number {
  return (now ?? (() => Math.floor(Date.now() / 1000)))();
}

export interface VerifyManifestSignerOptions {
  readonly now?: () => number;
}

export async function verifyManifestSigner(
  manifest: ParsedManifest,
  signature: `0x${string}`,
  expectedOwner: `0x${string}`,
  options: VerifyManifestSignerOptions = {},
): Promise<ManifestVerificationResult> {
  const nh = namehash(manifest.ensName);
  const verifiedAt = buildVerifiedAt(options.now);

  if (!isAddress(expectedOwner)) {
    return {
      ok: false,
      namehash: nh,
      reason: 'signer_mismatch',
      detail: `expectedOwner is not a valid address: ${expectedOwner}`,
    };
  }
  if (!SIGNATURE_RE.test(signature)) {
    return {
      ok: false,
      namehash: nh,
      reason: 'signature_invalid',
      detail: `signature is not a 65-byte hex string (length ${signature.length})`,
    };
  }

  const sourcesHash = declaredSourcesHash(manifest);
  let recovered: `0x${string}`;
  try {
    recovered = await recoverTypedDataAddress({
      domain: VERAL_MANIFEST_DOMAIN,
      types: VERAL_MANIFEST_TYPES,
      primaryType: VERAL_MANIFEST_PRIMARY_TYPE,
      message: {
        ensName: manifest.ensName,
        kind: manifest.kind,
        declaredSourcesHash: sourcesHash,
        signedAt: manifest.signedAt,
      },
      signature,
    });
  } catch (err) {
    return {
      ok: false,
      namehash: nh,
      reason: 'signature_invalid',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (recovered.toLowerCase() !== expectedOwner.toLowerCase()) {
    return {
      ok: false,
      namehash: nh,
      reason: 'signer_mismatch',
      detail: `recovered ${recovered}, expected ${expectedOwner}`,
    };
  }

  return {
    ok: true,
    namehash: nh,
    manifestHash: sourcesHash,
    signer: recovered,
    signerMatchesOwner: true,
    verifiedAt,
  };
}
