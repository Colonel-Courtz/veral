import type { SourceAgent } from '@veral/shared';

import { createEnsAgent } from './ens/agent';
import { createEthereumAgent } from './ethereum/agent';
import { createGithubAgent } from './github/agent';
import { createImmunefiAgent } from './immunefi/agent.js';
import { createSourcifyAgent } from './sourcify/agent';

export * from './ens/index';
export * from './ethereum/index';
export * from './github/index';
export * from './immunefi/index.js';
export * from './sourcify/index';

export function createExtractorRegistry(): ReadonlyArray<SourceAgent<unknown>> {
  return [
    createSourcifyAgent() as SourceAgent<unknown>,
    createGithubAgent() as SourceAgent<unknown>,
    createEthereumAgent() as SourceAgent<unknown>,
    createEnsAgent() as SourceAgent<unknown>,
    createImmunefiAgent() as SourceAgent<unknown>,
  ];
}
