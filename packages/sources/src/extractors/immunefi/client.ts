import type {
  ImmunefiPayoutHistory,
  ImmunefiProgramDetail,
  ImmunefiProgramSummary,
  ImmunefiSeverityTier,
} from './schema.js';

export const IMMUNEFI_BASE_URL = 'https://immunefi.com';
export const IMMUNEFI_BUG_BOUNTY_URL = `${IMMUNEFI_BASE_URL}/bug-bounty/`;

export interface ImmunefiHttpClient {
  fetchText(url: string): Promise<string>;
}

export class FetchImmunefiHttpClient implements ImmunefiHttpClient {
  async fetchText(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': '@veral/sources immunefi extractor',
      },
    });
    if (!response.ok) {
      throw new Error(`Immunefi request failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }
}

export const defaultImmunefiHttpClient = new FetchImmunefiHttpClient();

type UnknownRecord = Record<string, unknown>;

export async function fetchActiveImmunefiPrograms(
  client: ImmunefiHttpClient = defaultImmunefiHttpClient,
): Promise<ReadonlyArray<ImmunefiProgramSummary>> {
  const html = await client.fetchText(IMMUNEFI_BUG_BOUNTY_URL);
  return parseActiveProgramsFromHtml(html);
}

export async function fetchImmunefiProgramDetail(
  slug: string,
  client: ImmunefiHttpClient = defaultImmunefiHttpClient,
): Promise<ImmunefiProgramDetail> {
  const html = await client.fetchText(programDetailUrl(slug));
  return parseProgramDetailFromHtml(html);
}

export function programDetailUrl(slug: string): string {
  return `${IMMUNEFI_BASE_URL}/bug-bounty/${encodeURIComponent(slug)}/information/`;
}

export function parseActiveProgramsFromHtml(html: string): ReadonlyArray<ImmunefiProgramSummary> {
  const flightText = extractNextFlightText(html);
  const rawBounties = extractFlightJsonValue(flightText, '"bounties":');
  if (!Array.isArray(rawBounties)) {
    throw new Error('Immunefi active programs payload was not an array');
  }
  return rawBounties.map((program) => normalizeProgramSummary(asRecord(program)));
}

export function parseProgramDetailFromHtml(html: string): ImmunefiProgramDetail {
  const flightText = extractNextFlightText(html);
  const rawBounty = extractFlightJsonValue(flightText, '"bounty":');
  if (!isRecord(rawBounty)) {
    throw new Error('Immunefi program detail payload was not an object');
  }
  return normalizeProgramDetail(rawBounty);
}

export function extractNextFlightText(html: string): string {
  const marker = 'self.__next_f.push(';
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf(marker, cursor);
    if (start === -1) break;
    const argumentStart = start + marker.length;
    const argumentEnd = html.indexOf(')</script>', argumentStart);
    if (argumentEnd === -1) break;
    const argument = html.slice(argumentStart, argumentEnd);
    try {
      const parsed = JSON.parse(argument) as unknown;
      if (Array.isArray(parsed) && typeof parsed[1] === 'string') {
        chunks.push(parsed[1]);
      }
    } catch {
      // React Flight script chunks are best-effort public page data; malformed chunks are ignored.
    }
    cursor = argumentEnd + ')</script>'.length;
  }
  if (chunks.length === 0) {
    throw new Error('No Immunefi React Flight data found');
  }
  return chunks.join('');
}

export function extractFlightJsonValue(flightText: string, marker: string): unknown {
  const markerIndex = flightText.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Immunefi payload marker not found: ${marker}`);
  }
  const valueStart = markerIndex + marker.length;
  const first = flightText[valueStart];
  if (first !== '{' && first !== '[') {
    throw new Error(`Immunefi payload marker did not point at JSON: ${marker}`);
  }
  const valueEnd = findJsonBoundary(flightText, valueStart);
  return JSON.parse(flightText.slice(valueStart, valueEnd)) as unknown;
}

interface JsonScanState {
  depth: number;
  inString: boolean;
  escaped: boolean;
}

function findJsonBoundary(input: string, start: number): number {
  const state: JsonScanState = { depth: 0, inString: false, escaped: false };
  for (let index = start; index < input.length; index += 1) {
    if (advanceJsonScanState(state, input.charAt(index)) === 'closed') return index + 1;
  }
  throw new Error('Unterminated Immunefi JSON payload');
}

function advanceJsonScanState(state: JsonScanState, char: string): 'open' | 'closed' {
  if (state.inString) return advanceJsonStringState(state, char);
  if (char === '"') {
    state.inString = true;
    return 'open';
  }
  if (char === '{' || char === '[') state.depth += 1;
  if (char === '}' || char === ']') state.depth -= 1;
  return state.depth === 0 ? 'closed' : 'open';
}

function advanceJsonStringState(state: JsonScanState, char: string): 'open' {
  if (state.escaped) {
    state.escaped = false;
  } else if (char === '\\') {
    state.escaped = true;
  } else if (char === '"') {
    state.inString = false;
  }
  return 'open';
}

function normalizeProgramDetail(raw: UnknownRecord): ImmunefiProgramDetail {
  const summary = normalizeProgramSummary(raw);
  const rawRewards = arrayFrom(raw.programRewards).length > 0 ? raw.programRewards : raw.rewards;
  return {
    ...summary,
    rewardsToken: stringOrNull(raw.rewardsToken),
    rewardsTokenNetwork: stringOrNull(raw.rewardsTokenNetwork),
    severityTiers: arrayFrom(rawRewards).map(normalizeSeverityTier),
    impactCount: arrayFrom(raw.programImpacts).length || arrayFrom(raw.impacts).length,
  };
}

function normalizeProgramSummary(raw: UnknownRecord): ImmunefiProgramSummary {
  const performanceMetrics = asRecord(raw.performanceMetrics ?? {});
  return {
    slug: requiredString(raw.slug, 'slug'),
    project: requiredString(raw.project, 'project'),
    url: absoluteImmunefiUrl(requiredString(raw.url, 'url')),
    launchedAt: stringOrNull(raw.launchDate),
    updatedAt: stringOrNull(raw.updatedDate),
    maxBountyUsd: numberOrNull(raw.maxBounty),
    kycRequired: Boolean(raw.kyc),
    inviteOnly: Boolean(raw.inviteOnly),
    immunefiStandard: Boolean(raw.immunefiStandard),
    premiumTriaging: Boolean(raw.premiumTriaging),
    safeHarborActive: Boolean(raw.isSafeHarborActive),
    tags: normalizeTags(raw.tags),
    payoutHistory: normalizePayoutHistory(performanceMetrics),
  };
}

function normalizePayoutHistory(raw: UnknownRecord): ImmunefiPayoutHistory {
  return {
    totalPaidMetricEnabled: Boolean(raw.totalPaidMetricEnabled),
    totalPaidUsd: numberOrNull(raw.totalPaidAmount),
    responseTimeMetricEnabled: Boolean(raw.responseTimeMetricEnabled),
    medianResponseTimeMinutes: numberOrNull(raw.medianResponseTimeInMinutes),
  };
}

function normalizeSeverityTier(rawValue: unknown): ImmunefiSeverityTier {
  const raw = asRecord(rawValue);
  return {
    assetType: requiredString(raw.assetType, 'assetType'),
    severity: requiredString(raw.severity, 'severity').toLowerCase(),
    maxRewardUsd: numberOrNull(raw.maxReward),
    minRewardUsd: numberOrNull(raw.minReward),
    rewardModel: stringOrNull(raw.rewardModel),
    rewardCalculationPercentage: numberOrNull(raw.rewardCalculationPercentage),
  };
}

function normalizeTags(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).map(
    ([key, raw]) =>
      [key, arrayFrom(raw).filter((item): item is string => typeof item === 'string')] as const,
  );
  return Object.fromEntries(entries);
}

function absoluteImmunefiUrl(url: string): string {
  if (url.startsWith('https://')) return url;
  return `${IMMUNEFI_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): UnknownRecord {
  if (!isRecord(value)) {
    throw new Error('Expected Immunefi object payload');
  }
  return value;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing Immunefi field: ${field}`);
  }
  return value;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
