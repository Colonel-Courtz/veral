import type { SourceAgent } from '@veral/shared';

import { createSourcifyAgent } from './sourcify/agent.js';

export * from './sourcify/index.js';

export function createExtractorRegistry(): ReadonlyArray<SourceAgent<unknown>> {
  return [createSourcifyAgent() as SourceAgent<unknown>];
}
