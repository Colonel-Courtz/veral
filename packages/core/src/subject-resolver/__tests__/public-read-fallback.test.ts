import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL ??= 'http://kv.test.invalid';
  process.env.KV_REST_API_TOKEN ??= 'kv-test-token';
  process.env.TURSO_DATABASE_URL ??= 'file::memory:';
});

import type { EnsChain, EnsReader } from '../public-read-fallback.js';
import { publicReadFallback } from '../public-read-fallback.js';

const SUBJECT = 'alice.eth';
const SUBJECT_ADDR = `0x${'a'.repeat(40)}` as `0x${string}`;

function stubReader(map: {
  readAddress?: Partial<Record<EnsChain, `0x${string}` | null>>;
  readText?: Partial<Record<EnsChain, Record<string, string | null>>>;
}): EnsReader {
  return {
    async readAddress(chain) {
      return map.readAddress?.[chain] ?? null;
    },
    async readTextRecord(chain, _name, key) {
      return map.readText?.[chain]?.[key] ?? null;
    },
  };
}

describe('publicReadFallback', () => {
  it('returns onchain.primaryAddress when addr() resolves', async () => {
    const result = await publicReadFallback(SUBJECT, {
      ensReader: stubReader({ readAddress: { mainnet: SUBJECT_ADDR } }),
      sourcifyCheck: async () => false,
    });
    expect(result.onchain).toEqual({ primaryAddress: SUBJECT_ADDR });
    expect(result.ensInternal).toEqual({ rootName: 'eth' });
    expect(result.sourcify).toEqual([]);
    expect(result.github).toBeNull();
  });

  it('returns onchain=null when addr() resolves to null', async () => {
    const result = await publicReadFallback(SUBJECT, {
      ensReader: stubReader({}),
      sourcifyCheck: async () => false,
    });
    expect(result.onchain).toBeNull();
    expect(result.sourcify).toEqual([]);
  });

  it('probes Sourcify per chainId and adds verified chains to sourcify[]', async () => {
    const probed: number[] = [];
    const result = await publicReadFallback(SUBJECT, {
      ensReader: stubReader({ readAddress: { mainnet: SUBJECT_ADDR } }),
      sourcifyChainIds: [1, 11155111, 8453],
      sourcifyCheck: async (chainId) => {
        probed.push(chainId);
        return chainId === 1 || chainId === 8453;
      },
    });
    expect(probed.sort()).toEqual([1, 11155111, 8453].sort());
    expect(result.sourcify.map((s) => s.chainId).sort()).toEqual([1, 8453]);
    expect(result.sourcify.every((s) => s.address === SUBJECT_ADDR)).toBe(true);
    expect(result.sourcify.every((s) => s.label === null)).toBe(true);
  });

  it('skips Sourcify probing when no primary address is resolved', async () => {
    let probed = false;
    await publicReadFallback(SUBJECT, {
      ensReader: stubReader({}),
      sourcifyCheck: async () => {
        probed = true;
        return true;
      },
    });
    expect(probed).toBe(false);
  });

  it('derives rootName from the trailing label of the ENS name', async () => {
    const result = await publicReadFallback('foo.bar.alice.eth', {
      ensReader: stubReader({}),
      sourcifyCheck: async () => false,
    });
    expect(result.ensInternal.rootName).toBe('eth');
  });

  it('swallows readAddress throws and treats them as no-address', async () => {
    const reader: EnsReader = {
      async readAddress() {
        throw new Error('rpc down');
      },
      async readTextRecord() {
        return null;
      },
    };
    const result = await publicReadFallback(SUBJECT, {
      ensReader: reader,
      sourcifyCheck: async () => true,
    });
    expect(result.onchain).toBeNull();
    expect(result.sourcify).toEqual([]);
  });
});
