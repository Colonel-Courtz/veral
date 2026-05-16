import { z } from 'zod';

export const githubUserSchema = z.object({
  login: z.string().min(1),
  createdAt: z.string().nullable(),
  publicRepos: z.number().int().min(0),
});

export type GithubUser = z.infer<typeof githubUserSchema>;

export const githubRepoSchema = z.object({
  name: z.string().min(1),
  fullName: z.string().min(1),
  pushedAt: z.string().nullable(),
  stars: z.number().int().min(0),
  hasTestDir: z.boolean(),
  hasSubstantialReadme: z.boolean(),
  hasLicense: z.boolean(),
  // P1 enrichment — optional + nullable so old fixtures stay valid and
  // score engine treats either as "P1 didn't run". Populated by the
  // client's per-repo probes; degrades to null on any per-endpoint
  // failure (e.g. Actions disabled, Issues disabled, missing scope).
  ciRuns: z
    .object({
      successful: z.number().int().min(0),
      total: z.number().int().min(0),
    })
    .nullable()
    .optional(),
  bugIssues: z
    .object({
      closed: z.number().int().min(0),
      total: z.number().int().min(0),
    })
    .nullable()
    .optional(),
  releasesLast12m: z.number().int().min(0).nullable().optional(),
});

export type GithubRepo = z.infer<typeof githubRepoSchema>;

// trust: 'unverified' is structural — GitHub's free-tier endpoints carry
// owner-asserted data only (no signature, no namehash binding), so the
// score formula applies a ×0.6 trust discount to anything sourced here.
export const githubFindingsSchema = z.object({
  trust: z.literal('unverified'),
  user: githubUserSchema.nullable(),
  repos: z.array(githubRepoSchema),
  callBudget: z.number().int().min(0),
});

export type GithubFindings = z.infer<typeof githubFindingsSchema>;
