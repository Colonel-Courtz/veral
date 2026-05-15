import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL ??= 'http://kv.test.invalid';
  process.env.KV_REST_API_TOKEN ??= 'kv-test-token';
  process.env.TURSO_DATABASE_URL ??= 'file::memory:';
});

import type { DeclaredSources } from '@veral/shared';
import { SubjectResolutionError } from '@veral/shared';
import { namehash } from 'viem/ens';

import { VERAL_MANIFEST_VERSION } from '../manifest-parse.js';
import type { EnsChain, EnsReader } from '../public-read-fallback.js';
import { resolveSubject, VERAL_BENCH_MANIFEST_TEXT_KEY } from '../resolve.js';

const SUBJECT = 'alice.eth';
const SUBJECT_ADDR = `0x${'a'.repeat(40)}` as `0x${string}`;
const DECLARED_ONCHAIN = `0x${'b'.repeat(40)}` as `0x${string}`;

function manifestJson() {
  return {
    version: VERAL_MANIFEST_VERSION,
    ensName: SUBJECT,
    kind: 'project',
    declaredSources: {
      sourcify: [{ chainId: 1, address: `0x${'c'.repeat(40)}`, label: 'primary' }],
      github: { owner: 'alice', verified: true },
      onchain: { primaryAddress: DECLARED_ONCHAIN },
      ensInternal: { rootName: 'eth' },
    },
    signedAt: '2026-05-15T12:00:00Z',
  };
}

interface ReaderShape {
  text?: Partial<Record<EnsChain, Record<string, string | null>>>;
  addr?: Partial<Record<EnsChain, `0x${string}` | null>>;
  textThrows?: boolean;
}

function stubReader(shape: ReaderShape): EnsReader {
  return {
    async readAddress(chain) {
      return shape.addr?.[chain] ?? null;
    },
    async readTextRecord(chain, _name, key) {
      if (shape.textThrows) throw new Error('rpc down');
      return shape.text?.[chain]?.[key] ?? null;
    },
  };
}

describe('resolveSubject', () => {
  it('returns the manifest-derived SubjectManifest when a manifest text record is present', async () => {
    const reader = stubReader({
      text: { mainnet: { [VERAL_BENCH_MANIFEST_TEXT_KEY]: JSON.stringify(manifestJson()) } },
    });
    const subject = await resolveSubject(SUBJECT, { ensReader: reader });
    expect(subject.ensName).toBe(SUBJECT);
    expect(subject.namehash).toBe(namehash(SUBJECT));
    expect(subject.kind).toBe('project');
    expect(subject.primaryAddress).toBe(DECLARED_ONCHAIN);
    expect(subject.declaredSources.github?.owner).toBe('alice');
    expect(subject.declaredSources.sourcify).toHaveLength(1);
  });

  it('falls back to addr() when manifest carries no onchain entry', async () => {
    const json = manifestJson();
    json.declaredSources.onchain = null as unknown as typeof json.declaredSources.onchain;
    const reader = stubReader({
      text: { mainnet: { [VERAL_BENCH_MANIFEST_TEXT_KEY]: JSON.stringify(json) } },
      addr: { mainnet: SUBJECT_ADDR },
    });
    const subject = await resolveSubject(SUBJECT, { ensReader: reader });
    expect(subject.primaryAddress).toBe(SUBJECT_ADDR);
  });

  it('uses public-read fallback and kind="unknown" when no manifest is published', async () => {
    const fallback = vi.fn(
      async (): Promise<DeclaredSources> => ({
        sourcify: [],
        github: null,
        onchain: { primaryAddress: SUBJECT_ADDR },
        ensInternal: { rootName: 'eth' },
      }),
    );
    const reader = stubReader({});
    const subject = await resolveSubject(SUBJECT, { ensReader: reader, fallback });
    expect(subject.kind).toBe('unknown');
    expect(subject.primaryAddress).toBe(SUBJECT_ADDR);
    expect(fallback).toHaveBeenCalledWith(SUBJECT);
  });

  it('throws SubjectResolutionError when ENS text-record read fails', async () => {
    const reader = stubReader({ textThrows: true });
    await expect(resolveSubject(SUBJECT, { ensReader: reader })).rejects.toBeInstanceOf(
      SubjectResolutionError,
    );
  });

  it('throws SubjectResolutionError on malformed JSON in the manifest text record', async () => {
    const reader = stubReader({
      text: { mainnet: { [VERAL_BENCH_MANIFEST_TEXT_KEY]: '{not json' } },
    });
    await expect(resolveSubject(SUBJECT, { ensReader: reader })).rejects.toBeInstanceOf(
      SubjectResolutionError,
    );
  });

  it('throws SubjectResolutionError when manifest schema validation fails', async () => {
    const reader = stubReader({
      text: {
        mainnet: {
          [VERAL_BENCH_MANIFEST_TEXT_KEY]: JSON.stringify({ version: 'wrong' }),
        },
      },
    });
    await expect(resolveSubject(SUBJECT, { ensReader: reader })).rejects.toBeInstanceOf(
      SubjectResolutionError,
    );
  });

  it('rejects an empty ensName', async () => {
    await expect(resolveSubject('', { ensReader: stubReader({}) })).rejects.toBeInstanceOf(
      SubjectResolutionError,
    );
  });

  it('computes namehash deterministically for the same ENS name', async () => {
    const reader = stubReader({});
    const fallback = async (): Promise<DeclaredSources> => ({
      sourcify: [],
      github: null,
      onchain: null,
      ensInternal: { rootName: 'eth' },
    });
    const a = await resolveSubject(SUBJECT, { ensReader: reader, fallback });
    const b = await resolveSubject(SUBJECT, { ensReader: reader, fallback });
    expect(a.namehash).toBe(b.namehash);
    expect(a.namehash).toBe(namehash(SUBJECT));
  });
});
