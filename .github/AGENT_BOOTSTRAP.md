# Agent bootstrap — first-message template

This file is the **first thing an agent reads** when it starts a Veral task.
It is also the prompt the orchestrator (Daniel) pastes into a new agent session.

The goal of this file: an agent that walks in cold can pick up a single GitHub
issue, ship a single PR, and not invent anything that was already decided.

---

## 1. Identity and ground rules

You are working on **Veral** — Verification Authority Layer for Ethereum.
Repo: `B2JK-Industry/veral`. Production: `veral.tech`.

Before writing any code, read in order:

1. `CLAUDE.md` (anti-bloat rules, binding)
2. `CONTRIBUTING.md` (workflow, stub-first, escalation)
3. The `AGENTS.md` file of the package you are modifying
4. `docs/architecture/000-overview.md` (system shape)

If any of those four files contradict what is written below, those files win.

---

## 2. Boundaries you must not cross

This session runs under `--dangerously-skip-permissions`. The
`.claude/hooks/agent-guard.mjs` hook hard-blocks every action listed below; if
you try one, the tool call exits with code 2 and your task fails. Do not try
to work around the hook — the hook protects itself (see `.claude/` write
restriction).

**Hard-blocked file writes** (you cannot Write or Edit these):

- `CLAUDE.md`, `LICENSE`, `README.md`, `CONTRIBUTING.md`
- `.github/CODEOWNERS`, `.github/workflows/*`, `.github/AGENT_BOOTSTRAP.md`, `.github/LAUNCH_PLAYBOOK.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/dependabot.yml`, `.github/ISSUE_TEMPLATE/*`
- `contracts/*`, `docs/architecture/*`
- `biome.json`, `lefthook.yml`, `commitlint.config.cjs`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, root `package.json`, `.gitignore`
- `.claude/*` (the guardrails themselves)
- `scripts/seed-issues.sh`, `scripts/lint-comments.mjs`
- Anywhere outside the repo root (except `/tmp/` for ephemeral scripts)

**Hard-blocked file reads**:

- `.env`, `.env.local`, `.env.production`, `.env.<anything>` — only `.env.example` is allowed
- Anywhere outside the repo, except `/Users/danielbabjak/Desktop/ETHPrague2026/` (prior hackathon codebase, reference only) and `/tmp/`

**Hard-blocked bash commands**:

- Privilege escalation: `sudo`, `su`, `doas`
- Destructive: `rm -rf`, `rm -fr`, `rm -r`, `rm -f`, `find ... -delete`, `git clean -*`, `shred`, `wipe`
- Git destructive: `git push --force*`, `git reset --hard`, `git branch -D`, `git filter-branch`, `git filter-repo`, `git config user.*`, `git rebase -i`, `git push <remote> main`
- Deploy: any `vercel *` command
- Publish: `pnpm publish`, `npm publish`, `yarn publish`
- Dep installs with args: `pnpm add *`, `pnpm install <pkg>`, `pip install`, `brew install` (only `pnpm install --frozen-lockfile` is allowed)
- Solidity broadcasts: `forge create`, `forge script ... --broadcast`, `cast send`, `cast wallet *`
- RCE: `curl ... | bash`, `wget ... | sh`
- System control: `kill`, `pkill`, `reboot`, `shutdown`, `launchctl`, `systemctl`
- Remote: `ssh`, `scp`, `rsync`, `nc`, `ncat`
- Disable own guardrails: `lefthook uninstall`, `chmod ... .claude/*`, redirect into `.claude/`
- `.env` exfiltration via shell verbs: `cat .env`, `grep .env`, `curl ... .env`, etc.

**Hard-blocked network hosts** (curl/wget): only allowlisted hosts succeed.
Allowlist includes GitHub, Sourcify, Etherscan, Alchemy, CoinGecko, NPM
registry, The Graph, EAS. Any other host: blocked.

**Issue rules**:

- Do not pick up `requires:daniel`, `requires:human-review`, or `agent-claimed` issues.
- Do not work on an issue whose `Depends on:` list has any open item.

If the task requires any blocked action, **stop and escalate** per `CONTRIBUTING.md`.
The hook will not yield. Asking Daniel to bypass it is the only path.

---

## 3. The task you are picking up

When the orchestrator pastes the issue at you, that issue is your **sole scope**.
Do not refactor adjacent code. Do not add features. Do not write documentation
the issue did not ask for. The PR description proves what changed; the issue
proves why.

The issue body contains:

- **Motivation** — read carefully, this is the only "why" you get
- **Source pin** (if porting) — exact path + commit SHA in the prior codebase
- **Target layout** — exact paths to create in this repo
- **Acceptance criteria** — a checklist; every item must be true before you open the PR
- **Dependencies** — `Depends on:` issues must be merged before you start; if not, escalate

If the issue body does not have all of those sections, escalate — do not improvise.

---

## 4. Prior-art audit (mandatory before writing code)

The most expensive failure mode is **duplicating a utility that already exists**.
Before you create any new function, type, helper, or constant:

```bash
# 1. Check shared contracts first
grep -r "<the thing you're about to add>" packages/shared/src/

# 2. Check the package you're working in
grep -r "<the thing>" packages/<your-package>/src/

# 3. Check sibling packages
grep -r "<the thing>" packages/
```

If something close to what you need already exists in `@veral/shared/contracts/`,
`@veral/shared/agents/provenance.ts`, or any other shared module — **import it,
don't re-declare it**. Re-declaration is the #1 reason agent PRs get rejected.

Cross-package contracts that exist now and that you must use, not duplicate:

- `TierEligibilityResult`, `TierEligibilityRequirement` (tier gating)
- `PaymentVerification`, `PaymentQuote` (payment flow)
- `EvidenceBundle`, `EvidenceItem` (per-run evidence)
- `ScoreResult`, `ScoreComponent` (score formula output)
- `IssuanceInput`, `IssuanceResult` (EAS attestation)
- `ManifestVerificationResult` (ENS manifest signer check)
- `OrchestrationInput`, `OrchestrationOutput` (`@veral/core` orchestrator IO)
- `SourceAgent`, `AgentResult`, `AgentProvenance`, `BackendDescriptor` (agent base)
- `canonicalJson`, `sha256Hex`, `buildProvenance`, `hashCanonical` (hashing)
- `VeralError` and subclasses (errors)

All exported from `@veral/shared`. Import from there.

---

## 5. The flow — exactly these steps, in order

1. **Claim the issue.** Comment on the issue: `Agent claiming this issue. Will open PR within session.` Add the `agent-claimed` label.
2. **Worktree.** Create a worktree off `main` for this issue (do not work directly in the main checkout):
   ```bash
   git worktree add ../veral-<issue-number> -b feat/<issue-number>-<short-slug> origin/main
   cd ../veral-<issue-number>
   pnpm install --frozen-lockfile
   ```
3. **Verify CI baseline.** `pnpm typecheck && pnpm test && pnpm exec biome check . && pnpm exec madge --circular --extensions ts,tsx packages apps && node scripts/lint-comments.mjs`. All must pass on `main` before you touch anything — if not, escalate.
4. **Read.** Read every file the issue's Target layout mentions. Read the `AGENTS.md` of every package you import from.
5. **Prior-art audit.** Per section 4.
6. **Write.** Minimal change. No reference-tag comments. No file-header description blocks. Comments explain WHY only.
7. **Test locally.** Same five commands from step 3. All must pass.
8. **Commit.** Conventional Commits, scoped to one of: `shared`, `core`, `score`, `sources`, `authority`, `attest`, `web`, `contracts`, `docs`, `ci`, `repo`, `deps`. Reference the issue number in the body, not the subject.
9. **PR.** Use the template (`.github/PULL_REQUEST_TEMPLATE.md`). Every checkbox addressed. Link with `Closes #<issue>`.
10. **Wait for CI green.** If any gate fails: fix it. Do not retry with `--no-verify`. Do not push a "fix CI" commit without understanding the failure.
11. **Wait for Daniel review.** Address feedback in follow-up commits, not amends.

---

## 6. PR body discipline

The diff already shows what changed. The PR body should add only what the diff
cannot show:

- **Summary** — one sentence, the WHY
- **How verified** — exact commands you ran, with output if non-obvious
- **Trade-offs** — any decision you made that the issue did not specify
- **Risk** — what could go wrong in production that a reviewer should look at

Do **not** pad the body with restated acceptance criteria or file lists.
Do **not** include an "AI summary" of what you did. Reviewers can read the diff.

---

## 7. When you are stuck

If the issue spec is ambiguous, do **not** guess. Pick one of these:

- **Missing input** (env var, contract address, schema UID): comment on the issue, tag `requires:daniel`, stop.
- **Ambiguous spec** (two valid interpretations): comment with both options + your recommendation, tag `requires:human-review`, stop.
- **Rule conflict** (issue asks for something `CLAUDE.md` forbids): treat the rule as primary. Open a new issue proposing the rule change. Do not violate the rule.

A clean stop is cheaper than a hallucinated answer.

---

## 8. When you are done

After the PR is merged, your work is over. Do not:

- Start the next issue without an explicit hand-off from Daniel
- Open follow-up PRs "just to improve things"
- Update documentation that was not in scope

The next agent (or you in a new session) will pick up the next issue.
