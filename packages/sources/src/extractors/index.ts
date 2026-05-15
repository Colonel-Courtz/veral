import type { SourceAgent } from '@veral/shared';

import { createSourcifyAgent } from './sourcify/agent';

export * from './sourcify/index';

export function createExtractorRegistry(): ReadonlyArray<SourceAgent<unknown>> {
  return [createSourcifyAgent() as SourceAgent<unknown>];
}
