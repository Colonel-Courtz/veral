import { createHash } from 'node:crypto';
import type { AgentProvenance, AgentResult, BackendDescriptor } from './index.js';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map((k) => {
    const v = (value as Record<string, unknown>)[k];
    return `${JSON.stringify(k)}:${canonicalJson(v)}`;
  });
  return `{${entries.join(',')}}`;
}

export function sha256Hex(input: string): string {
  return `0x${createHash('sha256').update(input, 'utf8').digest('hex')}`;
}

export function hashCanonical(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export function buildProvenance(params: {
  readonly backend: BackendDescriptor;
  readonly input: unknown;
  readonly prompt?: string;
  readonly modelResponse?: string;
  readonly errorMessage?: string;
}): AgentProvenance {
  const base: { -readonly [K in keyof AgentProvenance]: AgentProvenance[K] } = {
    backend: params.backend,
    inputHash: hashCanonical(params.input),
  };
  if (params.prompt !== undefined) {
    base.promptHash = sha256Hex(params.prompt);
  }
  if (params.modelResponse !== undefined) {
    base.modelResponseHash = sha256Hex(params.modelResponse);
  }
  if (params.errorMessage !== undefined) {
    base.errorMessage = params.errorMessage;
  }
  return base;
}

export function hashAgentFindings<T>(result: AgentResult<T>): string | null {
  if (result.findings === null) return null;
  return hashCanonical(result.findings);
}
