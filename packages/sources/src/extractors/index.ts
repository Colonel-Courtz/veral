import type { SourceAgent } from '@veral/shared';
import { immunefiAgent } from './immunefi/index.js';
import { createSourcifyAgent } from './sourcify/agent.js';

export * from './immunefi/index.js';
export * from './sourcify/index.js';

export function createExtractorRegistry(): ReadonlyArray<SourceAgent<unknown>> {
  return [immunefiAgent, createSourcifyAgent() as SourceAgent<unknown>];
}
