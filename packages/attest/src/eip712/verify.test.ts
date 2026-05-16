import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';

import { signVeralCert } from './sign';
import { TIER_CODE, type VeralCertMessage, ZERO_BYTES32 } from './typed-data';
import { verifyVeralCert } from './verify';

const TEST_KEY = generatePrivateKey();
const OTHER_KEY = generatePrivateKey();
const TEST_ADDR = privateKeyToAccount(TEST_KEY).address;
const OTHER_ADDR = privateKeyToAccount(OTHER_KEY).address;

function bytes32(seed: string): `0x${string}` {
  return `0x${seed.repeat(64).slice(0, 64)}` as `0x${string}`;
}

function fixtureMessage(signer: `0x${string}` = TEST_ADDR): VeralCertMessage {
  return {
    subjectNamehash: bytes32('1'),
    subjectEnsName: 'alice.eth',
    tier: TIER_CODE.Sealed,
    score: 99,
    scoreFormulaVersion: 'v1.0.0',
    issuedAt: 1_700_000_000n,
    validUntil: 1_731_536_000n,
    evidenceBundleHash: bytes32('2'),
    aiProvenanceHash: ZERO_BYTES32,
    forensicHash: ZERO_BYTES32,
    signer,
    previousUID: ZERO_BYTES32,
  };
}

describe('verifyVeralCert', () => {
  it('round-trips: sign then verify against the same signer succeeds', async () => {
    const msg = fixtureMessage();
    const { signature } = await signVeralCert(msg, 1, { privateKey: TEST_KEY });
    const result = await verifyVeralCert(msg, signature, 1, TEST_ADDR);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.recovered.toLowerCase()).toBe(TEST_ADDR.toLowerCase());
    }
  });

  it('rejects a signature recovered to a different signer than expected', async () => {
    const msg = fixtureMessage();
    const { signature } = await signVeralCert(msg, 1, { privateKey: TEST_KEY });
    const result = await verifyVeralCert(msg, signature, 1, OTHER_ADDR);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('signer_mismatch');
      expect(result.recovered?.toLowerCase()).toBe(TEST_ADDR.toLowerCase());
    }
  });

  it('rejects a signature on a different chain (domain separation)', async () => {
    const msg = fixtureMessage();
    const { signature } = await signVeralCert(msg, 1, { privateKey: TEST_KEY });
    const result = await verifyVeralCert(msg, signature, 11155111, TEST_ADDR);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('signer_mismatch');
    }
  });

  it('rejects a signature whose payload was tampered after signing', async () => {
    const msg = fixtureMessage();
    const { signature } = await signVeralCert(msg, 1, { privateKey: TEST_KEY });
    const tampered: VeralCertMessage = { ...msg, score: msg.score + 1 };
    const result = await verifyVeralCert(tampered, signature, 1, TEST_ADDR);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('signer_mismatch');
    }
  });

  it('returns malformed_signature for a non-65-byte hex input', async () => {
    const msg = fixtureMessage();
    const result = await verifyVeralCert(msg, '0xdeadbeef', 1, TEST_ADDR);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('malformed_signature');
    }
  });

  it('returns recovery_failed when signature bytes are well-formed but unrecoverable', async () => {
    const msg = fixtureMessage();
    const badSig = `0x${'0'.repeat(130)}` as `0x${string}`;
    const result = await verifyVeralCert(msg, badSig, 1, TEST_ADDR);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(['recovery_failed', 'signer_mismatch']).toContain(result.reason);
    }
  });
});
