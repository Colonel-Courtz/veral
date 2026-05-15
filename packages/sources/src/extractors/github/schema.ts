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
