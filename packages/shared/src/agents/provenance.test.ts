import { describe, expect, it } from 'vitest';
import { buildProvenance, canonicalJson, hashCanonical, sha256Hex } from './provenance.js';

describe('canonicalJson', () => {
  it('sorts keys recursively so reordered objects hash identically', () => {
    const a = canonicalJson({ b: 1, a: { y: 2, x: 1 } });
    const b = canonicalJson({ a: { x: 1, y: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('handles primitives', () => {
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(42)).toBe('42');
  });
});

describe('sha256Hex', () => {
  it('produces a 0x-prefixed 64-char hex digest', () => {
    const h = sha256Hex('veral');
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe('hashCanonical', () => {
  it('returns same hash for key-reordered objects', () => {
    expect(hashCanonical({ a: 1, b: 2 })).toBe(hashCanonical({ b: 2, a: 1 }));
  });
});

describe('buildProvenance', () => {
  it('omits optional hash fields when inputs are undefined', () => {
    const p = buildProvenance({
      backend: { kind: 'rest-api', baseUrl: 'https://x', version: '1' },
      input: { v: 1 },
    });
    expect(p.inputHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(p.promptHash).toBeUndefined();
    expect(p.modelResponseHash).toBeUndefined();
    expect(p.errorMessage).toBeUndefined();
  });

  it('includes prompt and response hashes when provided', () => {
    const p = buildProvenance({
      backend: { kind: 'llm', provider: 'anthropic', model: 'opus' },
      input: { v: 1 },
      prompt: 'analyze',
      modelResponse: '{"ok":true}',
    });
    expect(p.promptHash).toBeDefined();
    expect(p.modelResponseHash).toBeDefined();
  });
});
