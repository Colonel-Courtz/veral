import type {
  DeclaredEnsInternal,
  DeclaredGithub,
  DeclaredOnchain,
  DeclaredSources,
  DeclaredSourcifyEntry,
  SubjectKind,
} from '@veral/shared';
import { VeralError } from '@veral/shared';

export const VERAL_MANIFEST_VERSION = 'veral.manifest.v1' as const;

export class ManifestParseError extends VeralError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('MANIFEST_PARSE_ERROR', message, options);
    this.name = 'ManifestParseError';
  }
}

export interface ParsedManifest {
  readonly version: typeof VERAL_MANIFEST_VERSION;
  readonly ensName: string;
  readonly kind: Exclude<SubjectKind, 'unknown'>;
  readonly declaredSources: DeclaredSources;
  readonly signedAt: string;
}

const HEX_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const MANIFEST_KINDS: ReadonlyArray<Exclude<SubjectKind, 'unknown'>> = [
  'ai-agent',
  'human-team',
  'project',
];

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function asObject(x: unknown, path: string): Record<string, unknown> {
  if (!isObject(x)) {
    throw new ManifestParseError(`${path}: expected object, got ${typeof x}`);
  }
  return x;
}

function asString(x: unknown, path: string): string {
  if (typeof x !== 'string' || x.length === 0) {
    throw new ManifestParseError(`${path}: expected non-empty string`);
  }
  return x;
}

function asHexAddress(x: unknown, path: string): `0x${string}` {
  if (typeof x !== 'string' || !HEX_ADDRESS_RE.test(x)) {
    throw new ManifestParseError(`${path}: expected 0x-prefixed 20-byte hex address`);
  }
  return x as `0x${string}`;
}

function asPositiveInt(x: unknown, path: string): number {
  if (typeof x !== 'number' || !Number.isInteger(x) || x <= 0) {
    throw new ManifestParseError(`${path}: expected positive integer`);
  }
  return x;
}

function asBoolean(x: unknown, path: string): boolean {
  if (typeof x !== 'boolean') throw new ManifestParseError(`${path}: expected boolean`);
  return x;
}

function asIsoDateTime(x: unknown, path: string): string {
  if (typeof x !== 'string' || !ISO_DATETIME_RE.test(x)) {
    throw new ManifestParseError(`${path}: expected ISO-8601 datetime`);
  }
  return x;
}

function parseSourcifyEntry(raw: unknown, path: string): DeclaredSourcifyEntry {
  const obj = asObject(raw, path);
  const labelRaw = obj.label;
  const label =
    labelRaw === null || labelRaw === undefined
      ? null
      : typeof labelRaw === 'string'
        ? labelRaw
        : (() => {
            throw new ManifestParseError(`${path}.label: expected string or null`);
          })();
  return {
    chainId: asPositiveInt(obj.chainId, `${path}.chainId`),
    address: asHexAddress(obj.address, `${path}.address`),
    label,
  };
}

function parseGithub(raw: unknown): DeclaredGithub | null {
  if (raw === null || raw === undefined) return null;
  const obj = asObject(raw, 'declaredSources.github');
  return {
    owner: asString(obj.owner, 'declaredSources.github.owner'),
    verified: asBoolean(obj.verified, 'declaredSources.github.verified'),
  };
}

function parseOnchain(raw: unknown): DeclaredOnchain | null {
  if (raw === null || raw === undefined) return null;
  const obj = asObject(raw, 'declaredSources.onchain');
  return {
    primaryAddress: asHexAddress(obj.primaryAddress, 'declaredSources.onchain.primaryAddress'),
  };
}

function parseEnsInternal(raw: unknown): DeclaredEnsInternal {
  const obj = asObject(raw, 'declaredSources.ensInternal');
  return {
    rootName: asString(obj.rootName, 'declaredSources.ensInternal.rootName'),
  };
}

function parseDeclaredSources(raw: unknown): DeclaredSources {
  const obj = asObject(raw, 'declaredSources');
  const sourcifyRaw = obj.sourcify;
  if (!Array.isArray(sourcifyRaw)) {
    throw new ManifestParseError('declaredSources.sourcify: expected array');
  }
  const sourcify: DeclaredSourcifyEntry[] = sourcifyRaw.map((entry, idx) =>
    parseSourcifyEntry(entry, `declaredSources.sourcify[${idx}]`),
  );
  return {
    sourcify,
    github: parseGithub(obj.github),
    onchain: parseOnchain(obj.onchain),
    ensInternal: parseEnsInternal(obj.ensInternal),
  };
}

function parseKind(raw: unknown): Exclude<SubjectKind, 'unknown'> {
  if (!MANIFEST_KINDS.includes(raw as Exclude<SubjectKind, 'unknown'>)) {
    throw new ManifestParseError(
      `kind: expected one of ${MANIFEST_KINDS.join(', ')}; got ${JSON.stringify(raw)}`,
    );
  }
  return raw as Exclude<SubjectKind, 'unknown'>;
}

export function parseBenchManifest(json: unknown): ParsedManifest {
  const obj = asObject(json, 'manifest');
  if (obj.version !== VERAL_MANIFEST_VERSION) {
    throw new ManifestParseError(
      `version: expected "${VERAL_MANIFEST_VERSION}", got ${JSON.stringify(obj.version)}`,
    );
  }
  return {
    version: VERAL_MANIFEST_VERSION,
    ensName: asString(obj.ensName, 'ensName'),
    kind: parseKind(obj.kind),
    declaredSources: parseDeclaredSources(obj.declaredSources),
    signedAt: asIsoDateTime(obj.signedAt, 'signedAt'),
  };
}
