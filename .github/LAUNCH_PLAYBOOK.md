# Launch playbook — dispatching agents on Veral

This file is the **orchestrator's** (Daniel's) operational guide.
It describes how to start agents, in what order, and how to detect drift.

For the agent-side instructions, see [`AGENT_BOOTSTRAP.md`](./AGENT_BOOTSTRAP.md).

---

## Pre-launch checklist (one-time)

Run before dispatching any agent. All must be green:

```bash
cd ~/Desktop/Veral
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm exec biome check .
pnpm exec madge --circular --extensions ts,tsx packages apps
node scripts/lint-comments.mjs
gh run list --branch main --limit 1 --json conclusion --jq '.[0].conclusion'   # must be "success"
```

If any fails, fix on `main` before any agent picks up an issue. Agents must
inherit a green baseline; debugging a broken main inside an agent session
wastes the agent's context.

---

## Ready-to-pick frontier

Find issues that are P0, unblocked, and not gated:

```bash
gh issue list \
  --repo B2JK-Industry/veral \
  --state open \
  --label "tier:P0" \
  --limit 100 \
  --json number,title,body,labels \
  --jq '.[]
        | select(.labels | map(.name) | (contains(["requires:daniel"]) or contains(["requires:human-review"]) or contains(["agent-claimed"])) | not)
        | select(.body | test("Depends on:\\*\\* _none_"))
        | "\(.number): \(.title)"'
```

Current frontier (verify with the command above before dispatch):

- **#11** — scaffold @veral/authority package structure
- **#44** — scaffold @veral/attest + EIP-712 typed-data schema
- **#48** — VeralPaymentForwarder.sol (Foundry — different toolchain)
- **#65** — write ADRs 005-014 from architecture audit gaps
- 16 source extractor agents (#28-#43) — all unblocked

---

## Dispatch — how to start one agent

Copy this exact prompt into a fresh Claude Code session (or paste to Codex /
Cursor agent). Replace `<NUM>` with the issue number.

```text
You are picking up issue B2JK-Industry/veral#<NUM> on Veral.

Read in order (every file, fully):
1. .github/AGENT_BOOTSTRAP.md
2. CLAUDE.md
3. CONTRIBUTING.md
4. The AGENTS.md of the package this issue targets
5. The issue body: gh issue view <NUM> --repo B2JK-Industry/veral

After reading, follow the flow in AGENT_BOOTSTRAP.md section 5 exactly.
Do not deviate. Do not refactor adjacent code. Open one PR that closes
issue #<NUM>. Stop when CI is green and the PR is awaiting review.
```

Nothing else. The prompt is intentionally short — the binding context lives
in the four files. A longer prompt fights with the files for cache budget.

---

## Parallel dispatch — multi-agent rules

Safe parallelism (do this):

- One agent per **package** (e.g. one in `@veral/score`, one in `@veral/sources/sourcify/`, one in `@veral/attest`). Typecheck enforces isolation.
- One agent per **source extractor** (#24, #25, #26, #27, ..., #43). Each lives in its own subdirectory.
- Stub-PR agent followed by implementation-PR agent (sequential on the same surface).

Unsafe parallelism (don't do this):

- Two agents on the same package's same module (e.g. both touching `packages/authority/src/tier-rules/`).
- Two agents whose `Blocks:` graph overlaps without sequencing.
- An agent on a cross-cutting refactor (authority + score + attest at once) in parallel with package-local agents.

Concurrency cap: **3 simultaneous agents max**. Beyond that, your review
bandwidth becomes the bottleneck and PRs queue up.

---

## Watching for drift

While agents run, glance at these every few hours:

1. **Open PRs**: `gh pr list --repo B2JK-Industry/veral` — should be small, scoped, and reference an issue.
2. **Failing CI**: `gh pr list --repo B2JK-Industry/veral --search "status:failure"` — fix or comment.
3. **Stuck agents**: PRs with no activity for >24h, or comments asking ambiguous questions — close PR, re-dispatch.
4. **Reference-tag tags appearing in code**: should be 0. CI catches them, but verify with `git log -p main..HEAD | grep -E "// (US|GATE|EPIC)-"`.

---

## Red-flag patterns (stop the agent immediately)

If you see any of these in a PR, the agent has drifted — close PR, re-dispatch with a stricter prompt:

- New utility that duplicates an existing one in `@veral/shared` — agent skipped prior-art audit
- File-header description blocks (multi-line `/** This file does X ... */`)
- Reference-tag comments (`// US-123`, `// GATE-X`)
- "Compatibility shim" / "unified wrapper" / "adapter layer" in PR description — agent built a parallel abstraction
- More than 500 LOC changed per PR — scope creep
- PR touches `CLAUDE.md`, `.github/workflows/`, `contracts/`, or `docs/architecture/` — agent crossed a Daniel-only boundary
- Tests with `.skip` or `xfail` added without a documented reason in the PR body
- Commit message body contains an AI summary of what the agent did

---

## Closing the loop

After merge:

1. The closing-comment on the issue is automatic (via `Closes #<NUM>` in PR).
2. Remove the `agent-claimed` label if still attached.
3. Run the frontier query (section "Ready-to-pick frontier") — new issues may be unblocked.
4. Remove the agent's worktree: `git worktree remove ../veral-<NUM>`.

Do not let merged-issue worktrees pile up — they confuse the next agent
when it tries to clone state.

---

## Cost / context economics

Cache hit ratio is what makes the agent loop affordable. To keep the cache warm:

- **Stable prefix.** Every agent reads the same four files in the same order. Don't reorder, don't insert dynamic content above them.
- **Fresh agent per issue.** Do NOT continue a single long-running agent across multiple issues. Cache TTL is 5min — long-running sessions blow it anyway, and a fresh agent has no drift from prior tasks.
- **No persistent monorepo-wide agent.** One agent that "knows everything" is one agent whose context blows up after issue 3.

For the 50+ P0 backlog, expect roughly $0.30-$1.50 of model spend per issue
on Opus-class models. A persistent agent attempting all 50 in one session
would cost 20-50x more and produce inconsistent results.
