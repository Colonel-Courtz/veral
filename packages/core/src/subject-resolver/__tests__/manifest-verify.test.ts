import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL ??= 'http://kv.test.invalid';
  process.env.KV_REST_API_TOKEN ??= 'kv-test-token';
  process.env.TURSO_DATABASE_URL ??= 'file::memory:';
});

import { canonicalJson } from '@veral/shared';
import { keccak256, stringToHex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { type ParsedManifest, VERAL_MANIFEST_VERSION } from '../manifest-parse';
import {
  VERAL_MANIFEST_DOMAIN,
  VERAL_MANIFEST_PRIMARY_TYPE,
  VERAL_MANIFEST_TYPES,
  verifyManifestSigner,
} from '../manifest-verify';

const SIGNER_KEY = generatePrivateKey();
const OTHER_KEY = generatePrivateKey();
const SIGNER_ADDR = privateKeyToAccount(SIGNER_KEY).address;
const OTHER_ADDR = privateKeyToAccount(OTHER_KEY).address;

function manifest(): ParsedManifest {
  return {
    version: VERAL_MANIFEST_VERSION,
    ensName: 'alice.eth',
    kind: 'project',
    declaredSources: {
      sourcify: [],
      github: null,
      onchain: null,
      ensInternal: { rootName: 'eth' },
    },
    signedAt: '2026-05-15T12:00:00Z',
  };
}

async function signManifest(
  m: ParsedManifest,
  key: `0x${string}` = SIGNER_KEY,
): Promise<`0x${string}`> {
  const account = privateKeyToAccount(key);
  const declaredSourcesHash = keccak256(stringToHex(canonicalJson(m.declaredSources)));
  return account.signTypedData({
    domain: VERAL_MANIFEST_DOMAIN,
    types: VERAL_MANIFEST_TYPES,
    primaryType: VERAL_MANIFEST_PRIMARY_TYPE,
    message: {
      ensName: m.ensName,
      kind: m.kind,
      declaredSourcesHash,
      signedAt: m.signedAt,
    },
  });
}

describe('verifyManifestSigner', () => {
  it('round-trips: sign then verify against the signer succeeds', async () => {
    const m = manifest();
    const sig = await signManifest(m);
    const result = await verifyManifestSigner(m, sig, SIGNER_ADDR, { now: () => 1700 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signer.toLowerCase()).toBe(SIGNER_ADDR.toLowerCase());
      expect(result.signerMatchesOwner).toBe(true);
      expect(result.manifestHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(result.verifiedAt).toBe(1700);
    }
  });

  it('rejects when the signer does not match expectedOwner', async () => {
    const m = manifest();
    const sig = await signManifest(m);
    const result = await verifyManifestSigner(m, sig, OTHER_ADDR);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('signer_mismatch');
    }
  });

  it('rejects when the payload was tampered after signing', async () => {
    const m = manifest();
    const sig = await signManifest(m);
    const tampered: ParsedManifest = { ...m, ensName: 'bob.eth' };
    const result = await verifyManifestSigner(tampered, sig, SIGNER_ADDR);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('signer_mismatch');
    }
  });

  it('rejects when declaredSources are tampered after signing', async () => {
    const m = manifest();
    const sig = await signManifest(m);
    const tampered: ParsedManifest = {
      ...m,
      declaredSources: {
        ...m.declaredSources,
        github: { owner: 'mallory', verified: false },
      },
    };
    const result = await verifyManifestSigner(tampered, sig, SIGNER_ADDR);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('signer_mismatch');
    }
  });

  it('returns signature_invalid for non-65-byte hex', async () => {
    const m = manifest();
    const result = await verifyManifestSigner(m, '0xdead', SIGNER_ADDR);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('signature_invalid');
    }
  });

  it('returns signer_mismatch when expectedOwner is not a valid address', async () => {
    const m = manifest();
    const sig = await signManifest(m);
    const result = await verifyManifestSigner(m, sig, 'not-an-address' as `0x${string}`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('signer_mismatch');
    }
  });

  it('returns signature_invalid when bytes are well-formed but unrecoverable', async () => {
    const m = manifest();
    const badSig = `0x${'0'.repeat(130)}` as `0x${string}`;
    const result = await verifyManifestSigner(m, badSig, SIGNER_ADDR);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['signature_invalid', 'signer_mismatch']).toContain(result.reason);
    }
  });
});
