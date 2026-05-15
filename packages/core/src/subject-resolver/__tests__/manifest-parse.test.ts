import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL ??= 'http://kv.test.invalid';
  process.env.KV_REST_API_TOKEN ??= 'kv-test-token';
  process.env.TURSO_DATABASE_URL ??= 'file::memory:';
});

import {
  ManifestParseError,
  parseBenchManifest,
  VERAL_MANIFEST_VERSION,
} from '../manifest-parse.js';

function validJson() {
  return {
    version: VERAL_MANIFEST_VERSION,
    ensName: 'alice.eth',
    kind: 'project',
    declaredSources: {
      sourcify: [{ chainId: 1, address: '0x'.padEnd(42, '1'), label: 'primary' }],
      github: { owner: 'alice', verified: true },
      onchain: { primaryAddress: '0x'.padEnd(42, '2') },
      ensInternal: { rootName: 'eth' },
    },
    signedAt: '2026-05-15T12:00:00Z',
  };
}

describe('parseBenchManifest', () => {
  it('parses a complete, well-formed manifest', () => {
    const m = parseBenchManifest(validJson());
    expect(m.version).toBe(VERAL_MANIFEST_VERSION);
    expect(m.ensName).toBe('alice.eth');
    expect(m.kind).toBe('project');
    expect(m.declaredSources.sourcify).toHaveLength(1);
    expect(m.declaredSources.github?.owner).toBe('alice');
    expect(m.declaredSources.onchain?.primaryAddress).toMatch(/^0x2+$/);
    expect(m.signedAt).toBe('2026-05-15T12:00:00Z');
  });

  it('throws ManifestParseError when version is wrong', () => {
    const json = { ...validJson(), version: 'veral.manifest.v999' };
    expect(() => parseBenchManifest(json)).toThrow(ManifestParseError);
  });

  it('throws when kind is not one of the three allowed values', () => {
    const json = { ...validJson(), kind: 'unknown' };
    expect(() => parseBenchManifest(json)).toThrow(/kind:/);
  });

  it('throws when sourcify is not an array', () => {
    const json = validJson();
    json.declaredSources.sourcify =
      'not-an-array' as unknown as typeof json.declaredSources.sourcify;
    expect(() => parseBenchManifest(json)).toThrow(/sourcify: expected array/);
  });

  it('throws when a sourcify entry address is malformed', () => {
    const json = validJson();
    json.declaredSources.sourcify[0] = {
      chainId: 1,
      address: 'not-hex',
      label: null,
    } as unknown as (typeof json.declaredSources.sourcify)[0];
    expect(() => parseBenchManifest(json)).toThrow(/address/);
  });

  it('accepts null github / onchain', () => {
    const json = validJson();
    json.declaredSources.github = null;
    json.declaredSources.onchain = null;
    const m = parseBenchManifest(json);
    expect(m.declaredSources.github).toBeNull();
    expect(m.declaredSources.onchain).toBeNull();
  });

  it('rejects non-ISO signedAt', () => {
    const json = { ...validJson(), signedAt: 'yesterday' };
    expect(() => parseBenchManifest(json)).toThrow(/signedAt/);
  });

  it('rejects non-object root', () => {
    expect(() => parseBenchManifest('a string')).toThrow(/manifest: expected object/);
    expect(() => parseBenchManifest(null)).toThrow(/manifest: expected object/);
    expect(() => parseBenchManifest([])).toThrow(/manifest: expected object/);
  });

  it('accepts a sourcify entry with null label', () => {
    const json = validJson();
    json.declaredSources.sourcify[0].label = null;
    const m = parseBenchManifest(json);
    expect(m.declaredSources.sourcify[0]?.label).toBeNull();
  });

  it('rejects negative or zero chainId', () => {
    const json = validJson();
    json.declaredSources.sourcify[0].chainId = 0;
    expect(() => parseBenchManifest(json)).toThrow(/chainId/);
  });
});
