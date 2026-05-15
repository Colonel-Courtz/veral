import type { AgentResult } from '../agents/index.js';
import type { SubjectManifest } from '../subject/types.js';
import type { TierKey } from '../tiers/index.js';

export interface EvidenceItem {
  readonly agentId: string;
  readonly agentVersion: string;
  readonly domain: string;
  readonly status: AgentResult<unknown>['status'];
  readonly findingsHash: string | null;
  readonly provenanceHash: string;
}

export interface EvidenceBundle {
  readonly bundleVersion: '1';
  readonly subject: SubjectManifest;
  readonly tier: TierKey;
  readonly runUuid: string;
  readonly items: ReadonlyArray<EvidenceItem>;
  readonly agentsTotal: number;
  readonly agentsSucceeded: number;
  readonly assembledAt: number;
  readonly bundleHash: string;
}
