import { mergeAbortSignals } from '@veral/shared';

export const DEFAULT_EAS_GRAPHQL_URL = 'https://easscan.org/graphql';
export const DEFAULT_EAS_TIMEOUT_MS = 10_000;
export const EAS_PAGE_SIZE = 100;

export type EasFetchErrorReason =
  | 'network_error'
  | 'malformed_response'
  | 'http_error'
  | 'graphql_error';

export class EasFetchError extends Error {
  readonly reason: EasFetchErrorReason;
  readonly httpStatus: number | undefined;
  constructor(reason: EasFetchErrorReason, message: string, httpStatus?: number) {
    super(message);
    this.name = 'EasFetchError';
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

export type EasFetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

// easscan.org exposes a Prisma-based GraphQL surface. The
// recipient-broad query is intentionally separate from the
// trusted-attester query: a recipient with thousands of attestations
// would otherwise blow past the page cap and lose the trusted signal
// to the noise. Two queries also keep callBudget at 1 when the
// trusted-issuer list is empty.
const ATTESTATIONS_BY_RECIPIENT_QUERY = `
query VeralEasByRecipient($recipient: String!, $take: Int!) {
  attestations(
    where: { recipient: { equals: $recipient }, revoked: { equals: false } },
    orderBy: [{ time: desc }],
    take: $take
  ) {
    id
    attester
    recipient
    schemaId
    time
    revoked
    revocationTime
  }
}
`.trim();

const ATTESTATIONS_BY_TRUSTED_ISSUERS_QUERY = `
query VeralEasByTrusted($recipient: String!, $attesters: [String!]!, $take: Int!) {
  attestations(
    where: {
      recipient: { equals: $recipient },
      revoked: { equals: false },
      attester: { in: $attesters }
    },
    orderBy: [{ time: desc }],
    take: $take
  ) {
    id
    attester
    recipient
    schemaId
    time
    revoked
    revocationTime
  }
}
`.trim();

export interface EasRawAttestation {
  readonly id: `0x${string}`;
  readonly attester: `0x${string}`;
  readonly recipient: `0x${string}`;
  readonly schemaId: `0x${string}`;
  readonly time: number;
  readonly revoked: boolean;
  readonly revocationTime: number | null;
}

export interface EasClientOptions {
  readonly endpointUrl?: string;
  readonly fetchImpl?: EasFetchImpl;
  readonly timeoutMs?: number;
  // Orchestrator-supplied cancellation. Threaded into both GraphQL
  // POSTs and merged with the per-request timeout so either deadline
  // aborts in-flight network work.
  readonly signal?: AbortSignal;
}

interface PostContext {
  readonly url: string;
  readonly fetchImpl: EasFetchImpl;
  readonly timeoutMs: number;
  readonly externalSignal: AbortSignal | undefined;
}

function buildPostContext(options: EasClientOptions): PostContext {
  return {
    url: options.endpointUrl ?? DEFAULT_EAS_GRAPHQL_URL,
    fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
    timeoutMs: options.timeoutMs ?? DEFAULT_EAS_TIMEOUT_MS,
    externalSignal: options.signal,
  };
}

async function postGraphql(
  ctx: PostContext,
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown> {
  if (ctx.externalSignal?.aborted) {
    throw new EasFetchError('network_error', 'eas: aborted before graphql request');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  const signal = mergeAbortSignals(controller.signal, ctx.externalSignal);
  let response: Response;
  try {
    response = await ctx.fetchImpl(ctx.url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal,
    });
  } catch (err) {
    throw new EasFetchError(
      'network_error',
      `eas: network error — ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new EasFetchError('http_error', `eas: graphql HTTP ${response.status}`, response.status);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new EasFetchError(
      'malformed_response',
      `eas: graphql invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return body;
}

function asObject(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function asLowerHex(raw: unknown, byteLen: number): `0x${string}` | null {
  if (typeof raw !== 'string') return null;
  const expected = byteLen * 2 + 2;
  if (raw.length !== expected) return null;
  const lower = raw.toLowerCase();
  if (!/^0x[0-9a-f]+$/.test(lower)) return null;
  return lower as `0x${string}`;
}

function asNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function parseAttestationNode(raw: unknown): EasRawAttestation | null {
  const obj = asObject(raw);
  if (obj === null) return null;
  const id = asLowerHex(obj.id, 32);
  const attester = asLowerHex(obj.attester, 20);
  const recipient = asLowerHex(obj.recipient, 20);
  const schemaId = asLowerHex(obj.schemaId, 32);
  const time = asNumber(obj.time);
  if (id === null || attester === null || recipient === null || schemaId === null || time === null)
    return null;
  const revoked = obj.revoked === true;
  const revocationTimeRaw = asNumber(obj.revocationTime);
  const revocationTime =
    revocationTimeRaw === null || revocationTimeRaw === 0 ? null : revocationTimeRaw;
  return { id, attester, recipient, schemaId, time, revoked, revocationTime };
}

function assertNoGraphqlErrors(obj: Record<string, unknown>): void {
  if (!Array.isArray(obj.errors) || obj.errors.length === 0) return;
  const head = obj.errors[0];
  const msg =
    head !== null && typeof head === 'object' && 'message' in head
      ? String((head as { message: unknown }).message)
      : JSON.stringify(head);
  throw new EasFetchError('graphql_error', `eas: graphql error — ${msg}`);
}

function extractAttestations(raw: unknown): ReadonlyArray<EasRawAttestation> {
  const root = asObject(raw);
  if (root === null) {
    throw new EasFetchError('malformed_response', 'eas: graphql response is not an object');
  }
  assertNoGraphqlErrors(root);
  const data = asObject(root.data);
  if (data === null) return [];
  const list = data.attestations;
  if (!Array.isArray(list)) return [];
  const out: EasRawAttestation[] = [];
  for (const node of list) {
    const parsed = parseAttestationNode(node);
    if (parsed !== null) out.push(parsed);
  }
  return out;
}

export async function fetchAttestationsByRecipient(
  recipient: `0x${string}`,
  options: EasClientOptions = {},
): Promise<ReadonlyArray<EasRawAttestation>> {
  const ctx = buildPostContext(options);
  const raw = await postGraphql(ctx, ATTESTATIONS_BY_RECIPIENT_QUERY, {
    recipient: recipient.toLowerCase(),
    take: EAS_PAGE_SIZE,
  });
  return extractAttestations(raw);
}

export async function fetchAttestationsByTrustedIssuers(
  recipient: `0x${string}`,
  attesterAddresses: ReadonlyArray<`0x${string}`>,
  options: EasClientOptions = {},
): Promise<ReadonlyArray<EasRawAttestation>> {
  if (attesterAddresses.length === 0) return [];
  const ctx = buildPostContext(options);
  const raw = await postGraphql(ctx, ATTESTATIONS_BY_TRUSTED_ISSUERS_QUERY, {
    recipient: recipient.toLowerCase(),
    attesters: attesterAddresses.map((a) => a.toLowerCase()),
    take: EAS_PAGE_SIZE,
  });
  return extractAttestations(raw);
}
