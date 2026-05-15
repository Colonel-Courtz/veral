import { describe, expect, it } from 'vitest';

import {
  buildVeralCertDomain,
  buildVeralCertTypedData,
  TIER_CODE,
  VERAL_CERT_DOMAIN_NAME,
  VERAL_CERT_DOMAIN_VERSION,
  VERAL_CERT_PRIMARY_TYPE,
  VERAL_CERT_TYPED_DATA_TYPES,
  type VeralCertMessage,
  ZERO_ADDRESS,
  ZERO_BYTES32,
} from './typed-data';

function bytes32(seed: string): `0x${string}` {
  return `0x${seed.repeat(64).slice(0, 64)}` as `0x${string}`;
}

function fixtureMessage(): VeralCertMessage {
  return {
    subjectNamehash: bytes32('1'),
    subjectEnsName: 'alice.eth',
    tier: TIER_CODE.Anchored,
    score: 87,
    scoreFormulaVersion: 'v1.0.0',
    issuedAt: 1_700_000_000n,
    validUntil: 1_731_536_000n,
    evidenceBundleHash: bytes32('2'),
    aiProvenanceHash: ZERO_BYTES32,
    forensicHash: ZERO_BYTES32,
    signer: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    previousUID: ZERO_BYTES32,
  };
}

describe('buildVeralCertDomain', () => {
  it('sets the locked name, version, zero verifyingContract', () => {
    const d = buildVeralCertDomain(1);
    expect(d.name).toBe(VERAL_CERT_DOMAIN_NAME);
    expect(d.version).toBe(VERAL_CERT_DOMAIN_VERSION);
    expect(d.chainId).toBe(1);
    expect(d.verifyingContract).toBe(ZERO_ADDRESS);
  });

  it('changes chainId per network so a mainnet signature does not verify on sepolia', () => {
    expect(buildVeralCertDomain(1).chainId).toBe(1);
    expect(buildVeralCertDomain(11155111).chainId).toBe(11155111);
  });
});

describe('buildVeralCertTypedData', () => {
  it('returns the canonical schema and primary type', () => {
    const td = buildVeralCertTypedData(fixtureMessage(), 1);
    expect(td.primaryType).toBe(VERAL_CERT_PRIMARY_TYPE);
    expect(td.types).toBe(VERAL_CERT_TYPED_DATA_TYPES);
  });

  it('preserves message fields without mutation', () => {
    const msg = fixtureMessage();
    const td = buildVeralCertTypedData(msg, 1);
    expect(td.message).toEqual(msg);
  });
});

describe('VERAL_CERT_TYPED_DATA_TYPES', () => {
  it('binds all twelve cert fields in the locked order', () => {
    const fields = VERAL_CERT_TYPED_DATA_TYPES.VeralCert.map((f) => f.name);
    expect(fields).toEqual([
      'subjectNamehash',
      'subjectEnsName',
      'tier',
      'score',
      'scoreFormulaVersion',
      'issuedAt',
      'validUntil',
      'evidenceBundleHash',
      'aiProvenanceHash',
      'forensicHash',
      'signer',
      'previousUID',
    ]);
  });

  it('encodes tier as uint8 and score as uint16 (cap-driven)', () => {
    const byName = Object.fromEntries(
      VERAL_CERT_TYPED_DATA_TYPES.VeralCert.map((f) => [f.name, f.type]),
    );
    expect(byName.tier).toBe('uint8');
    expect(byName.score).toBe('uint16');
    expect(byName.issuedAt).toBe('uint64');
    expect(byName.validUntil).toBe('uint64');
  });
});

describe('TIER_CODE', () => {
  it('matches the EAS uint8 mapping locked in AGENTS.md', () => {
    expect(TIER_CODE.Public).toBe(0);
    expect(TIER_CODE.Anchored).toBe(1);
    expect(TIER_CODE.Sealed).toBe(2);
  });
});
