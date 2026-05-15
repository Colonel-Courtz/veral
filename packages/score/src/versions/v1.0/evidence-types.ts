export type ScoreSubjectMode = 'manifest' | 'public-read';

export interface ScoreSubjectIdentity {
  readonly mode: ScoreSubjectMode;
  readonly manifest: {
    readonly sources: {
      readonly github: { readonly verified: boolean } | null;
    };
  } | null;
}

export type SourcifyMatchLevel = 'exact_match' | 'match' | 'not_found';

export interface SourcifyEntryDeep {
  readonly match: SourcifyMatchLevel;
  readonly creationMatch: SourcifyMatchLevel | null;
  readonly runtimeMatch: SourcifyMatchLevel | null;
  readonly functionSignatures: ReadonlyArray<unknown> | null;
}

export interface SourcifyEntryOk {
  readonly kind: 'ok';
  readonly deep: SourcifyEntryDeep;
}

export interface SourcifyEntryError {
  readonly kind: 'error';
}

export type SourcifyEntryEvidence = SourcifyEntryOk | SourcifyEntryError;

export interface GithubRepoP0 {
  readonly pushedAt: string | null;
  readonly hasTestDir: boolean;
  readonly hasSubstantialReadme: boolean;
  readonly hasLicense: boolean;
  readonly hasSecurity?: boolean;
  readonly hasDependabot?: boolean;
  readonly hasBranchProtection?: boolean;
  readonly ciRuns?: { readonly successful: number; readonly total: number } | null;
  readonly bugIssues?: { readonly closed: number; readonly total: number } | null;
  readonly releasesLast12m?: number | null;
}

export interface GithubP0Signals {
  readonly user: { readonly login: string } | null;
  readonly repos: ReadonlyArray<GithubRepoP0>;
}

export type GithubEvidence =
  | { readonly kind: 'ok'; readonly value: GithubP0Signals }
  | { readonly kind: 'error' }
  | { readonly kind: 'absent' };

export interface OnchainActivity {
  readonly nonce: number;
  readonly firstTxBlock: bigint | null;
  readonly latestBlock: bigint;
  readonly transferCountRecent90d?: number | null;
  readonly transferCountProvider?: string | null;
}

export interface OnchainEntryOk {
  readonly kind: 'ok';
  readonly chainId: number;
  readonly value: OnchainActivity;
}

export interface OnchainEntryError {
  readonly kind: 'error';
  readonly chainId: number;
}

export type OnchainEntryEvidence = OnchainEntryOk | OnchainEntryError;

export interface EnsInternalSignals {
  readonly registrationDate: number | null;
  readonly subnameCount: number;
  readonly textRecordCount: number;
  readonly lastRecordUpdateBlock: bigint | null;
}

export type EnsInternalEvidence =
  | { readonly kind: 'ok'; readonly value: EnsInternalSignals }
  | { readonly kind: 'error' }
  | { readonly kind: 'absent' };

export interface MultiSourceEvidence {
  readonly subject: ScoreSubjectIdentity;
  readonly sourcify: ReadonlyArray<SourcifyEntryEvidence>;
  readonly github: GithubEvidence;
  readonly onchain: ReadonlyArray<OnchainEntryEvidence>;
  readonly ensInternal: EnsInternalEvidence;
}

export type ComponentStatus = 'computed' | 'null_p1' | 'null_no_data';

export interface ComponentValue {
  readonly value: number | null;
  readonly status: ComponentStatus;
  readonly note?: string;
}
