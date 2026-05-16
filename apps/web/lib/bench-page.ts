import type { ScoreResult } from '@veral/shared';
import type { BenchHandlerErrorCode } from './bench-handler';

export interface TierBadge {
  readonly label: string;
  readonly tone: 'public' | 'anchored' | 'sealed';
}

export function tierBadge(tier: ScoreResult['tier']): TierBadge {
  if (tier === 'Anchored') return { label: 'Anchored', tone: 'anchored' };
  if (tier === 'Sealed') return { label: 'Sealed', tone: 'sealed' };
  return { label: 'Public', tone: 'public' };
}

// Score is bounded 0-100 by the engine. Pad to a fixed 2-digit width
// (e.g. "07") so the LCP element doesn't reflow when the digit count
// changes between renders.
export function formatScore(score: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return clamped < 10 ? `0${clamped}` : String(clamped);
}

export function formatPercent(value: number, fractionDigits = 1): string {
  const clamped = Math.max(0, Math.min(1, value));
  return `${(clamped * 100).toFixed(fractionDigits)}%`;
}

export function formatTrustDiscount(discount: number): string {
  return `×${discount.toFixed(2)}`;
}

// Unix-seconds -> ISO 8601 in UTC. Server-rendered timestamps need a
// deterministic format so the page hash is cache-friendly; locale
// formatting would re-render per visitor.
export function formatComputedAt(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

export interface ErrorPanelContent {
  readonly title: string;
  readonly body: string;
  readonly hint?: string;
}

export function errorPanelContent(code: BenchHandlerErrorCode): ErrorPanelContent {
  if (code === 'BAD_REQUEST') {
    return {
      title: 'Invalid ENS name',
      body: 'The path segment is not a recognised ENS name.',
      hint: 'Expected format: <label>.eth (or any subdomain thereof).',
    };
  }
  if (code === 'NOT_FOUND') {
    return {
      title: 'Subject not resolved',
      body: 'Veral could not resolve this ENS name to any on-chain or manifest evidence.',
      hint: 'If you own this name, publish a veral.bench-manifest text record to opt into Anchored or Sealed.',
    };
  }
  if (code === 'SERVICE_UNAVAILABLE') {
    return {
      title: 'Service temporarily unavailable',
      body: 'Veral could not reach its data sources for this request.',
      hint: 'The server is missing a required configuration value. Retry shortly; if the failure persists, the operator has been alerted.',
    };
  }
  if (code === 'BAD_GATEWAY') {
    return {
      title: 'Upstream data source temporarily unavailable',
      body: 'One of Veral’s evidence sources did not respond. The score cannot be computed right now.',
      hint: 'Refresh in a minute. If the failure persists, the source is rate-limiting Veral.',
    };
  }
  return {
    title: 'Unexpected error',
    body: 'Veral hit an unexpected condition while computing this score.',
  };
}

export type AgentStatusTone = 'ok' | 'partial' | 'error' | 'absent';

export interface AgentStatusDisplay {
  readonly label: string;
  readonly tone: AgentStatusTone;
}

export function agentStatusDisplay(
  status: 'ok' | 'partial' | 'error' | 'absent',
): AgentStatusDisplay {
  if (status === 'ok') return { label: 'OK', tone: 'ok' };
  if (status === 'partial') return { label: 'Partial', tone: 'partial' };
  if (status === 'error') return { label: 'Error', tone: 'error' };
  return { label: 'Absent', tone: 'absent' };
}

// The domain string on a ScoreComponent matches the source taxonomy
// (sourcify / github / onchain / ens-internal / ...). Group components
// so the breakdown table can render a "Verified" / "Unverified" header
// row above each cluster.
export interface BreakdownCluster {
  readonly domain: string;
  readonly trust: 'verified' | 'unverified';
  readonly components: ReadonlyArray<ScoreResult['components'][number]>;
}

export function clusterByDomain(
  components: ScoreResult['components'],
): ReadonlyArray<BreakdownCluster> {
  const byDomain = new Map<string, ScoreResult['components'][number][]>();
  for (const c of components) {
    const list = byDomain.get(c.domain) ?? [];
    list.push(c);
    byDomain.set(c.domain, list);
  }
  const out: BreakdownCluster[] = [];
  for (const [domain, list] of byDomain) {
    // trustDiscount === 1 means verified; 0.6 means unverified per the
    // locked v1.0 score formula.
    const trust = list[0]?.trustDiscount === 1 ? 'verified' : 'unverified';
    out.push({ domain, trust, components: list });
  }
  return out;
}
