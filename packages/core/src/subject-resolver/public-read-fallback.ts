import type { DeclaredSources, DeclaredSourcifyEntry } from '@veral/shared';
import { fetchSourcifyContract } from '@veral/sources';

export type EnsChain = 'mainnet' | 'sepolia';

export interface EnsReader {
  readAddress(chain: EnsChain, name: string): Promise<`0x${string}` | null>;
  readTextRecord(chain: EnsChain, name: string, key: string): Promise<string | null>;
}

export interface PublicReadFallbackOptions {
  readonly ensReader?: EnsReader;
  readonly mainnetRpcUrl?: string;
  readonly sepoliaRpcUrl?: string;
  readonly sourcifyBaseUrl?: string;
  // Chain ids probed against Sourcify when the primary address is known.
  // Defaults to mainnet + sepolia — the two chains we hold ENS resolvers
  // for. Adding chains here costs N Sourcify HTTP calls per resolution.
  readonly sourcifyChainIds?: ReadonlyArray<number>;
  // Test injection point — replaces the Sourcify HTTP call entirely.
  readonly sourcifyCheck?: (chainId: number, address: `0x${string}`) => Promise<boolean>;
}

const DEFAULT_SOURCIFY_CHAIN_IDS: ReadonlyArray<number> = [1, 11155111];

function rootName(ensName: string): string {
  const parts = ensName.split('.');
  return parts[parts.length - 1] ?? ensName;
}

async function defaultSourcifyCheck(
  chainId: number,
  address: `0x${string}`,
  baseUrl: string | undefined,
): Promise<boolean> {
  try {
    const finding = await fetchSourcifyContract(chainId, address, baseUrl ? { baseUrl } : {});
    return finding.match !== 'not_found';
  } catch {
    return false;
  }
}

export async function publicReadFallback(
  ensName: string,
  options: PublicReadFallbackOptions = {},
): Promise<DeclaredSources> {
  const reader = options.ensReader ?? buildEnsReaderFromEnv(options);
  let primaryAddress: `0x${string}` | null = null;
  try {
    primaryAddress = await reader.readAddress('mainnet', ensName);
  } catch {
    primaryAddress = null;
  }

  const sourcify: DeclaredSourcifyEntry[] = [];
  if (primaryAddress) {
    const chainIds = options.sourcifyChainIds ?? DEFAULT_SOURCIFY_CHAIN_IDS;
    const check =
      options.sourcifyCheck ??
      ((chainId, address) => defaultSourcifyCheck(chainId, address, options.sourcifyBaseUrl));
    const probes = await Promise.all(
      chainIds.map(async (chainId) => ({
        chainId,
        verified: await check(chainId, primaryAddress as `0x${string}`),
      })),
    );
    for (const probe of probes) {
      if (probe.verified) {
        sourcify.push({
          chainId: probe.chainId,
          address: primaryAddress,
          label: null,
        });
      }
    }
  }

  return {
    sourcify,
    github: null,
    onchain: primaryAddress ? { primaryAddress } : null,
    ensInternal: { rootName: rootName(ensName) },
  };
}

import { SubjectResolverConfigError } from '@veral/shared';
import { createPublicClient, http } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { normalize } from 'viem/ens';

export function buildEnsReaderFromEnv(
  options: { readonly mainnetRpcUrl?: string; readonly sepoliaRpcUrl?: string } = {},
): EnsReader {
  const mainnetUrl = options.mainnetRpcUrl ?? process.env.ALCHEMY_RPC_URL_MAINNET;
  const sepoliaUrl = options.sepoliaRpcUrl ?? process.env.ALCHEMY_RPC_URL_SEPOLIA;
  if (!mainnetUrl) {
    throw new SubjectResolverConfigError(
      'ALCHEMY_RPC_URL_MAINNET is not set and no mainnetRpcUrl override supplied',
    );
  }
  if (!sepoliaUrl) {
    throw new SubjectResolverConfigError(
      'ALCHEMY_RPC_URL_SEPOLIA is not set and no sepoliaRpcUrl override supplied',
    );
  }
  const mainnetClient = createPublicClient({ chain: mainnet, transport: http(mainnetUrl) });
  const sepoliaClient = createPublicClient({ chain: sepolia, transport: http(sepoliaUrl) });
  const client = (chain: EnsChain) => (chain === 'mainnet' ? mainnetClient : sepoliaClient);
  return {
    async readAddress(chain, name) {
      return client(chain).getEnsAddress({ name: normalize(name) });
    },
    async readTextRecord(chain, name, key) {
      return client(chain).getEnsText({ name: normalize(name), key });
    },
  };
}
