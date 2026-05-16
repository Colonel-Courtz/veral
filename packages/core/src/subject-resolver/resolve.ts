import type { DeclaredSources, SubjectManifest } from '@veral/shared';
import { SubjectResolutionError } from '@veral/shared';
import { namehash } from 'viem/ens';

import { type ParsedManifest, parseBenchManifest } from './manifest-parse';
import {
  buildEnsReaderFromEnv,
  type EnsChain,
  type EnsReader,
  publicReadFallback,
} from './public-read-fallback';

export const VERAL_BENCH_MANIFEST_TEXT_KEY = 'veral.bench-manifest' as const;

export interface ResolveSubjectOptions {
  readonly ensReader?: EnsReader;
  readonly mainnetRpcUrl?: string;
  readonly sepoliaRpcUrl?: string;
  readonly sourcifyBaseUrl?: string;
  // Replace the public-read fallback entirely (tests).
  readonly fallback?: (ensName: string) => Promise<DeclaredSources>;
}

async function readManifestText(reader: EnsReader, ensName: string): Promise<string | null> {
  try {
    return await reader.readTextRecord('mainnet', ensName, VERAL_BENCH_MANIFEST_TEXT_KEY);
  } catch (err) {
    throw new SubjectResolutionError(
      `ENS text-record read failed for ${ensName} key=${VERAL_BENCH_MANIFEST_TEXT_KEY}`,
      { cause: err },
    );
  }
}

function parseManifestJson(text: string, ensName: string): ParsedManifest {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new SubjectResolutionError(`manifest JSON parse failed for ${ensName}`, { cause: err });
  }
  try {
    return parseBenchManifest(json);
  } catch (err) {
    throw new SubjectResolutionError(`manifest schema validation failed for ${ensName}`, {
      cause: err,
    });
  }
}

async function readPrimaryAddress(
  reader: EnsReader,
  chain: EnsChain,
  ensName: string,
): Promise<`0x${string}` | null> {
  try {
    return await reader.readAddress(chain, ensName);
  } catch {
    return null;
  }
}

export async function resolveSubject(
  ensName: string,
  options: ResolveSubjectOptions = {},
): Promise<SubjectManifest> {
  if (typeof ensName !== 'string' || ensName.length === 0) {
    throw new SubjectResolutionError('ensName must be a non-empty string');
  }
  const reader = options.ensReader ?? buildEnsReaderFromEnv(options);
  const nh = namehash(ensName);
  const manifestText = await readManifestText(reader, ensName);

  if (manifestText !== null) {
    const parsed = parseManifestJson(manifestText, ensName);
    const onchainAddress = parsed.declaredSources.onchain?.primaryAddress ?? null;
    const primaryAddress = onchainAddress ?? (await readPrimaryAddress(reader, 'mainnet', ensName));
    return {
      ensName,
      namehash: nh,
      primaryAddress,
      kind: parsed.kind,
      declaredSources: parsed.declaredSources,
    };
  }

  const fallback =
    options.fallback ??
    ((name: string) =>
      publicReadFallback(name, {
        ensReader: reader,
        ...(options.sourcifyBaseUrl !== undefined
          ? { sourcifyBaseUrl: options.sourcifyBaseUrl }
          : {}),
      }));
  const declaredSources = await fallback(ensName);
  const primaryAddress = declaredSources.onchain?.primaryAddress ?? null;
  return {
    ensName,
    namehash: nh,
    primaryAddress,
    kind: 'unknown',
    declaredSources,
  };
}
