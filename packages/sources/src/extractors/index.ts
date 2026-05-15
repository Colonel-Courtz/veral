import type { SourceAgent } from '@veral/shared';

import { createGithubAgent } from './github/agent';
import { createSourcifyAgent } from './sourcify/agent';

export * from './github/index';
export * from './sourcify/index';

export function createExtractorRegistry(): ReadonlyArray<SourceAgent<unknown>> {
  return [
    createSourcifyAgent() as SourceAgent<unknown>,
    createGithubAgent() as SourceAgent<unknown>,
  ];
}
