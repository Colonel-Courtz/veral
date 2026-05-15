import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { REPORT_SIGNER_PRIVATE_KEY_ENV, signVeralCert } from './sign';
import {
  TIER_CODE,
  VERAL_CERT_PRIMARY_TYPE,
  type VeralCertMessage,
  ZERO_BYTES32,
} from './typed-data';

const TEST_KEY = generatePrivateKey();
const TEST_ADDR = privateKeyToAccount(TEST_KEY).address;
const OTHER_KEY = generatePrivateKey();

function bytes32(seed: string): `0x${string}` {
  return `0x${seed.repeat(64).slice(0, 64)}` as `0x${string}`;
}

function fixtureMessage(signer: `0x${string}` = TEST_ADDR): VeralCertMessage {
  return {
    subjectNamehash: bytes32('1'),
    subjectEnsName: 'alice.eth',
    tier: TIER_CODE.Public,
    score: 50,
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

describe('signVeralCert', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[REPORT_SIGNER_PRIVATE_KEY_ENV];
    delete process.env[REPORT_SIGNER_PRIVATE_KEY_ENV];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[REPORT_SIGNER_PRIVATE_KEY_ENV];
    } else {
      process.env[REPORT_SIGNER_PRIVATE_KEY_ENV] = originalEnv;
    }
  });

  it('reads REPORT_SIGNER_PRIVATE_KEY from env when no override is given', async () => {
    process.env[REPORT_SIGNER_PRIVATE_KEY_ENV] = TEST_KEY;
    const result = await signVeralCert(fixtureMessage(), 1);
    expect(result.signer.toLowerCase()).toBe(TEST_ADDR.toLowerCase());
    expect(result.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
    expect(result.typedData.primaryType).toBe(VERAL_CERT_PRIMARY_TYPE);
  });

  it('accepts an explicit privateKey override and bypasses env', async () => {
    const result = await signVeralCert(fixtureMessage(), 1, { privateKey: TEST_KEY });
    expect(result.signer.toLowerCase()).toBe(TEST_ADDR.toLowerCase());
  });

  it('throws when env is missing and no override is given', async () => {
    await expect(signVeralCert(fixtureMessage(), 1)).rejects.toThrow(
      /REPORT_SIGNER_PRIVATE_KEY is not set/,
    );
  });

  it('throws on a malformed env key', async () => {
    process.env[REPORT_SIGNER_PRIVATE_KEY_ENV] = '0xdeadbeef';
    await expect(signVeralCert(fixtureMessage(), 1)).rejects.toThrow(/not a 32-byte hex string/);
  });

  it('rejects a message whose signer field does not match the signing account', async () => {
    const wrongSigner = privateKeyToAccount(OTHER_KEY).address;
    await expect(
      signVeralCert(fixtureMessage(wrongSigner), 1, { privateKey: TEST_KEY }),
    ).rejects.toThrow(/does not match signing account/);
  });

  it('produces a different signature for the same message on a different chain', async () => {
    const msg = fixtureMessage();
    const onMainnet = await signVeralCert(msg, 1, { privateKey: TEST_KEY });
    const onSepolia = await signVeralCert(msg, 11155111, { privateKey: TEST_KEY });
    expect(onMainnet.signature).not.toBe(onSepolia.signature);
  });
});
