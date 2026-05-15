import type {
  ComponentValue,
  GithubRepoP0,
  MultiSourceEvidence,
  SourcifyEntryEvidence,
} from './evidence-types.js';

const NULL_P1: ComponentValue = { value: null, status: 'null_p1' };
const NULL_NO_DATA: ComponentValue = { value: null, status: 'null_no_data' };

const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_MONTH = 30 * SECONDS_PER_DAY;

// Anti-gaming: ignore Sourcify entries whose function-signature count is
// below 2. A Hello-World contract publishes 0–1 functions; we want real
// surface before compileSuccess accepts the verification as evidence.
function entryPassesComplexityGate(entry: SourcifyEntryEvidence): boolean {
  if (entry.kind !== 'ok') return false;
  const fnCount = entry.deep.functionSignatures?.length ?? 0;
  return fnCount >= 2;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function compileSuccess(evidence: MultiSourceEvidence): ComponentValue {
  const entries = evidence.sourcify.filter(entryPassesComplexityGate);
  if (entries.length === 0) return NULL_NO_DATA;
  let numer = 0;
  for (const e of entries) {
    if (e.kind !== 'ok') continue;
    const c = e.deep.creationMatch;
    const r = e.deep.runtimeMatch;
    if (c === 'exact_match' && r === 'exact_match') numer += 1;
  }
  return { value: numer / entries.length, status: 'computed' };
}

export function testPresence(evidence: MultiSourceEvidence): ComponentValue {
  const gh = evidence.github;
  if (gh.kind !== 'ok') return NULL_NO_DATA;
  const repos = gh.value.repos;
  if (repos.length === 0) return NULL_NO_DATA;
  const numer = repos.reduce((acc, r) => acc + (r.hasTestDir ? 1 : 0), 0);
  return { value: numer / repos.length, status: 'computed' };
}

// Hygiene mean per-repo over P0 signals (README>200 chars, LICENSE) plus
// any P1 enrichments (SECURITY/dependabot/branch-protection) that ran.
// Denominator grows per repo with each P1 boolean that landed, so a
// P0-only repo scores comparably with a fully-enriched neighbour.
const REPO_HYGIENE_P1_FLAGS = ['hasSecurity', 'hasDependabot', 'hasBranchProtection'] as const;

function repoHygieneFraction(r: GithubRepoP0): number {
  let signals = (r.hasSubstantialReadme ? 1 : 0) + (r.hasLicense ? 1 : 0);
  let count = 2;
  for (const flag of REPO_HYGIENE_P1_FLAGS) {
    const v = r[flag];
    if (typeof v === 'boolean') {
      count += 1;
      if (v) signals += 1;
    }
  }
  return signals / count;
}

export function repoHygiene(evidence: MultiSourceEvidence): ComponentValue {
  const gh = evidence.github;
  if (gh.kind !== 'ok') return NULL_NO_DATA;
  const repos = gh.value.repos;
  if (repos.length === 0) return NULL_NO_DATA;
  const sum = repos.reduce((acc, r) => acc + repoHygieneFraction(r), 0);
  return { value: sum / repos.length, status: 'computed' };
}

// SourcifyDeep does not currently carry verifiedAt; treat any
// verified entry as recent until the deep fetcher surfaces the
// timestamp. Stale-but-verified entries still score 1.0 — acceptable
// because v1 evidence has no stale-vs-recent disambiguation.
export function sourcifyRecency(evidence: MultiSourceEvidence): ComponentValue {
  const verifiedEntries = evidence.sourcify.filter(
    (e) =>
      e.kind === 'ok' &&
      (e.deep.creationMatch === 'exact_match' || e.deep.runtimeMatch === 'exact_match'),
  );
  if (evidence.sourcify.length === 0) return NULL_NO_DATA;
  if (verifiedEntries.length === 0) return { value: 0, status: 'computed' };
  return { value: 1.0, status: 'computed' };
}

// P0 stand-in: fraction of repos pushed within 90 days. Monotonic in
// real recency; re-derivable from pushedAt timestamps.
export function githubRecency(evidence: MultiSourceEvidence, nowSeconds: number): ComponentValue {
  const gh = evidence.github;
  if (gh.kind === 'absent') return NULL_NO_DATA;
  if (gh.kind !== 'ok') return NULL_NO_DATA;
  const repos = gh.value.repos;
  if (repos.length === 0) return NULL_NO_DATA;
  const cutoff = nowSeconds - 90 * SECONDS_PER_DAY;
  let numer = 0;
  for (const r of repos) {
    if (!r.pushedAt) continue;
    const ts = Date.parse(r.pushedAt);
    if (!Number.isFinite(ts)) continue;
    const tsSec = Math.floor(ts / 1000);
    if (tsSec >= cutoff) numer += 1;
  }
  return { value: numer / repos.length, status: 'computed' };
}

// Indexer signal (transferCountRecent90d) preferred; falls back to
// nonce/cap-1000 so a chain with no indexer key still contributes.
export function onchainRecency(evidence: MultiSourceEvidence): ComponentValue {
  const okOnchain = evidence.onchain.filter((o): o is OnchainEntryEvidenceOk => o.kind === 'ok');
  if (okOnchain.length === 0) return NULL_NO_DATA;

  let indexerHit = false;
  let totalRecent = 0;
  let totalNonce = 0;
  let provider: string | null = null;
  for (const o of okOnchain) {
    totalNonce += o.value.nonce;
    if (typeof o.value.transferCountRecent90d === 'number') {
      indexerHit = true;
      totalRecent += o.value.transferCountRecent90d;
      if (provider === null && typeof o.value.transferCountProvider === 'string') {
        provider = o.value.transferCountProvider;
      }
    }
  }

  if (indexerHit) {
    return {
      value: clamp01(totalRecent / 1000),
      status: 'computed',
      note:
        provider !== null
          ? `transferCountRecent90d / cap 1000 (provider: ${provider})`
          : 'transferCountRecent90d / cap 1000',
    };
  }
  return {
    value: clamp01(totalNonce / 1000),
    status: 'computed',
    note: 'fallback: lifetime outbound nonce / cap 1000 (no indexer key)',
  };
}

type OnchainEntryEvidenceOk = Extract<MultiSourceEvidence['onchain'][number], { kind: 'ok' }>;

// Refuses to fabricate a now-block from wall time. A real anchor is
// taken from the mainnet on-chain entry; without it, returns no-data
// rather than mis-scoring every record as 50 years stale.
function resolveNowBlock(evidence: MultiSourceEvidence): bigint | null {
  for (const entry of evidence.onchain) {
    if (entry.kind === 'ok' && entry.chainId === 1) {
      return entry.value.latestBlock;
    }
  }
  return null;
}

export function ensRecency(evidence: MultiSourceEvidence, _nowSeconds: number): ComponentValue {
  const ens = evidence.ensInternal;
  if (ens.kind === 'absent') return NULL_NO_DATA;
  if (ens.kind !== 'ok') return NULL_NO_DATA;
  const last = ens.value.lastRecordUpdateBlock;
  if (last === null) return NULL_NO_DATA;
  const registrationSec = ens.value.registrationDate;
  if (registrationSec === null || registrationSec <= 0) return NULL_NO_DATA;

  const nowBlock = resolveNowBlock(evidence);
  if (nowBlock === null) return NULL_NO_DATA;
  if (last >= nowBlock) return { value: 1.0, status: 'computed' };

  const blocksPerMonth = SECONDS_PER_MONTH / 12;
  const ageBlocks = nowBlock - last;
  const ageMonths = Number(ageBlocks) / blocksPerMonth;
  const months = Math.min(ageMonths, 24);
  const freshness = 1 - months / 24;
  return {
    value: clamp01(freshness),
    status: 'computed',
    note: 'mainnet 12s block time; nowBlock from onchain.latestBlock',
  };
}

export function nonZeroSourceCount(evidence: MultiSourceEvidence): number {
  let count = 0;
  if (evidence.sourcify.some((e) => e.kind === 'ok' && e.deep.match !== 'not_found')) {
    count += 1;
  }
  if (evidence.github.kind === 'ok' && evidence.github.value.user !== null) {
    count += 1;
  }
  if (
    evidence.onchain.some(
      (o) => o.kind === 'ok' && (o.value.nonce > 0 || o.value.firstTxBlock !== null),
    )
  ) {
    count += 1;
  }
  if (
    evidence.ensInternal.kind === 'ok' &&
    (evidence.ensInternal.value.subnameCount > 0 ||
      evidence.ensInternal.value.textRecordCount > 0 ||
      evidence.ensInternal.value.registrationDate !== null)
  ) {
    count += 1;
  }
  return count;
}

export function ciPassRate(evidence: MultiSourceEvidence): ComponentValue {
  const gh = evidence.github;
  if (gh.kind !== 'ok') return NULL_P1;
  const repos = gh.value.repos;
  let any = false;
  let successful = 0;
  let total = 0;
  for (const r of repos) {
    if (r.ciRuns === undefined) continue;
    any = true;
    if (r.ciRuns === null) continue;
    successful += r.ciRuns.successful;
    total += r.ciRuns.total;
  }
  if (!any) return NULL_P1;
  if (total === 0) return { value: 0, status: 'computed', note: 'no workflow runs across repos' };
  return { value: successful / total, status: 'computed' };
}

// Denominator-zero short-circuits to 1.0 (no bugs = clean), per locked
// formula. Distinguish "no bug-labeled issues at all" from "P1 not run".
export function bugHygiene(evidence: MultiSourceEvidence): ComponentValue {
  const gh = evidence.github;
  if (gh.kind !== 'ok') return NULL_P1;
  const repos = gh.value.repos;
  let any = false;
  let closed = 0;
  let total = 0;
  for (const r of repos) {
    if (r.bugIssues === undefined) continue;
    any = true;
    if (r.bugIssues === null) continue;
    closed += r.bugIssues.closed;
    total += r.bugIssues.total;
  }
  if (!any) return NULL_P1;
  if (total === 0) return { value: 1.0, status: 'computed', note: 'no bug-labeled issues' };
  return { value: closed / total, status: 'computed' };
}

export function releaseCadence(evidence: MultiSourceEvidence): ComponentValue {
  const gh = evidence.github;
  if (gh.kind !== 'ok') return NULL_P1;
  const repos = gh.value.repos;
  let any = false;
  let total = 0;
  for (const r of repos) {
    if (r.releasesLast12m === undefined) continue;
    any = true;
    if (r.releasesLast12m === null) continue;
    total += r.releasesLast12m;
  }
  if (!any) return NULL_P1;
  return { value: Math.min(total, 12) / 12, status: 'computed' };
}
