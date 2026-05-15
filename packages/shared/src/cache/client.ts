import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;

if (!url || !token) {
  throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN are required');
}

export const redis = new Redis({ url, token });

export const CACHE_TTL = {
  SOURCIFY: 60 * 60 * 24,
  GITHUB: 60 * 60,
  ETHERSCAN: 60 * 60 * 24,
  ONCHAIN: 60 * 5,
  ENS_RECORDS: 60 * 5,
  EAS: 60 * 60,
  DEFILLAMA: 60 * 60,
  EIGENLAYER: 60 * 60,
  THE_GRAPH: 60 * 60,
  TOKEN_LISTS: 60 * 60 * 24,
  GITCOIN_PASSPORT: 60 * 60,
  POAP: 60 * 60 * 24,
  FARCASTER: 60 * 60,
  LENS: 60 * 60,
  CODE4RENA: 60 * 60 * 24 * 7,
  IMMUNEFI: 60 * 60 * 24 * 7,
  TENDERLY: 60 * 60 * 24,
  SAFE: 60 * 60,
  NPM: 60 * 60 * 24,
  OPENCORPORATES: 60 * 60 * 24 * 7,
  COMPANIES_HOUSE: 60 * 60 * 24 * 7,
  SEC_EDGAR: 60 * 60 * 24 * 7,
  OFAC: 60 * 60 * 24,
  PRICE_ORACLE_PUBLIC: 60 * 15,
  PRICE_ORACLE_ANCHORED: 60 * 30,
  PRICE_ORACLE_SEALED: 60 * 60 * 24,
} as const;

export async function getOrFetch<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await redis.get<T>(key);
  if (cached !== null) {
    return cached;
  }
  const fresh = await fetcher();
  await redis.set(key, fresh, { ex: ttlSeconds });
  return fresh;
}
