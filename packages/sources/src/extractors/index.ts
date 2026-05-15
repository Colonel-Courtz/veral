import type { SourceAgent } from '@veral/shared';
import { immunefiAgent } from './immunefi/index.js';

export * from './immunefi/index.js';

export function createExtractorRegistry(): ReadonlyArray<SourceAgent<unknown>> {
  return [immunefiAgent];
}
