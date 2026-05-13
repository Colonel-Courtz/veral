export interface SubjectManifest {
  readonly ensName: string;
  readonly namehash: `0x${string}`;
  readonly primaryAddress: `0x${string}` | null;
  readonly kind: SubjectKind;
  readonly declaredSources: DeclaredSources;
}

export type SubjectKind = 'ai-agent' | 'human-team' | 'project' | 'unknown';

export interface DeclaredSources {
  readonly sourcify: ReadonlyArray<DeclaredSourcifyEntry>;
  readonly github: DeclaredGithub | null;
  readonly onchain: DeclaredOnchain | null;
  readonly ensInternal: DeclaredEnsInternal;
}

export interface DeclaredSourcifyEntry {
  readonly chainId: number;
  readonly address: `0x${string}`;
  readonly label: string | null;
}

export interface DeclaredGithub {
  readonly owner: string;
  readonly verified: boolean;
}

export interface DeclaredOnchain {
  readonly primaryAddress: `0x${string}`;
}

export interface DeclaredEnsInternal {
  readonly rootName: string;
}
