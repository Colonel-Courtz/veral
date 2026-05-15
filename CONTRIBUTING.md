# Contributing to Veral

Veral is the Verification Authority Layer for Ethereum. This guide is for both
human and AI-agent contributors. It is **mandatory reading** before opening a
PR.

## Read first

1. [`README.md`](./README.md) — project overview
2. [`CLAUDE.md`](./CLAUDE.md) — anti-bloat rules + architectural principles (binding for all contributors)
3. [`docs/architecture/`](./docs/architecture/) — locked architectural decisions (ADRs)
4. The `AGENTS.md` file in the package you are modifying — package-specific scope and boundaries

## Workflow

1. Pick an issue from [GitHub Issues](https://github.com/B2JK-Industry/veral/issues) in the `To Do` column of the [Project board](https://github.com/orgs/B2JK-Industry/projects)
2. Move the issue to `In Progress` and assign yourself
3. Create a branch from `main`: `feat/<issue-number>-<short-description>` or `fix/<issue-number>-<short-description>`
4. Implement the change, following the package's `AGENTS.md` and the rules in [`CLAUDE.md`](./CLAUDE.md)
5. Commit using [Conventional Commits](https://www.conventionalcommits.org) — enforced by commitlint
6. Open a PR using the template — every checklist item must be addressed
7. CI must be green: typecheck, lint, build, tests, cycles, runtime-data-guard, CodeQL
8. PR is reviewed (human or AI code review)
9. Merge to `main` triggers production deploy

## Commit message format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`, `build`, `style`, `revert`

**Scopes:** `shared`, `core`, `score`, `sources`, `authority`, `attest`, `web`, `contracts`, `docs`, `ci`, `repo`, `deps`

**Examples:**

- `feat(authority): add tier eligibility check for Sealed`
- `fix(sources): handle Sourcify timeout in deep field fetch`
- `refactor(score): extract weight resolver into pure function`

## Pre-commit checks

Lefthook runs automatically on every commit:

- Biome check (format + lint) on staged files, auto-fixing where possible
- Typecheck on the `@veral/shared` package if any TS file is staged
- Runtime-data guard (no committed files under `apps/web/public/{cache,manifests,reports}`)
- Commit message lint

If any check fails, the commit is rejected. Fix and try again.

## CI gates (must pass before merge)

- `CI / Typecheck + Lint + Build` — workspace-wide typecheck and build
- `CI / Unit tests` — vitest with coverage thresholds
- `Lint + Format / Biome check`
- `Lint + Format / Dependency cycle check` (madge)
- `Lint + Format / Runtime data guard`
- `Lint + Format / Commit message lint` (PRs only)
- `CodeQL / Analyze` — security scanning
- `Deploy Preview` — Vercel preview deploy on PR

## Anti-bloat rules (excerpt — see [`CLAUDE.md`](./CLAUDE.md) for the full list)

1. **Single source of truth per concept.** Do not create a parallel registry, runner, or aggregator alongside an existing one. Modify the existing system instead.
2. **No reference-tag comments.** Comments like `// US-123`, `// GATE-X`, `// EPIC §Y` are forbidden — they rot. Linked PR descriptions and issues hold this metadata.
3. **Comments explain WHY, not WHAT.** Well-named identifiers explain what.
4. **No file-header description blocks.** Filename and exports are the documentation.
5. **Runtime data never in `public/`.** Use Turso, Vercel Blob, or Upstash Redis.
6. **No emoji** in code, markdown, or commit messages.

## Architecture changes

If your change modifies package boundaries, dependency direction, or any
locked principle, you **must** open a new ADR in `docs/architecture/`
following the existing numbering convention. The PR template will ask you to
link it.

## Test expectations

| Package | Coverage target |
|---|---|
| `@veral/shared` | 70%+ |
| `@veral/score` | 80%+ (deterministic core) |
| `@veral/authority` | 80%+ (decision engine) |
| `@veral/sources` | 60%+ (external API integrations, partial mock) |
| `@veral/attest` | 70%+ |
| `@veral/core` | 70%+ |
| `apps/web` | 50%+ (presentational components excluded) |

## AI-agent contributors

If you are an AI agent (Claude, OpenAI Codex, or similar):

1. Read the issue body fully before writing code
2. Read the package's `AGENTS.md` for boundaries
3. Read `CLAUDE.md` for anti-bloat rules
4. Make minimal changes — do not refactor unrelated code
5. Run lint and tests locally before committing
6. If you encounter an architectural ambiguity, open an issue (do not invent)

### Stub-first workflow

For any new cross-package surface (a new contract type, an exported function
consumed by another package, an EAS schema field, an environment variable):

1. Add the type / signature / stub to the producing package with a clear
   `throw new Error('not implemented')` body.
2. Update consumers to import the stub and typecheck against it.
3. Open a PR labelled `stub` that lands the surface across the workspace.
4. Land the implementation in a follow-up PR. The stub PR unblocks parallel
   agent work; the implementation PR proves correctness.

This prevents the most common multi-agent failure mode: two agents inventing
incompatible shapes for the same boundary.

### Escalation procedure

If a task cannot be completed by an agent without violating a rule or without
inventing missing information, do NOT proceed by guessing. Stop and escalate:

1. **Missing input** (env var, ENS record, contract address, schema UID): post
   a comment on the issue with the exact name + where it is expected to come
   from. Add the `requires:daniel` label. Do not stub the value.
2. **Ambiguous spec** (two valid interpretations of the issue): post a comment
   listing both interpretations + your recommendation, add the
   `requires:human-review` label, and wait for an answer before writing code.
3. **Rule conflict** (the spec asks for something CLAUDE.md forbids): treat
   the rule as primary and the spec as a request to update the rule. Open a
   new issue proposing the rule change with a clear motivation; do not silently
   violate the rule.

Hallucinated values that pass typecheck but are wrong in reality are the most
expensive failure mode in this codebase. An open question is cheaper than a
wrong answer that ships.

### Pre-defined cross-package contracts

Cross-package shapes live in [`packages/shared/src/contracts/`](./packages/shared/src/contracts/).
These are the canonical types — do not re-define them inside `@veral/core`,
`@veral/authority`, `@veral/attest`, or `@veral/sources`. Importing the
contract type guarantees compatibility across the workspace:

- `TierEligibilityResult` — authority gate output
- `PaymentVerification` — payment verifier output
- `EvidenceBundle` — assembled per-run evidence
- `ScoreResult` — score formula output
- `IssuanceResult` — EAS attestation outcome
- `ManifestVerificationResult` — ENS manifest signer check
- `OrchestrationInput` / `OrchestrationOutput` — `@veral/core` orchestrator IO

Provenance helpers (`canonicalJson`, `sha256Hex`, `hashCanonical`,
`buildProvenance`) live in `@veral/shared/agents/provenance.ts`. Use them for
every agent's input/output hashing — do not implement ad-hoc hashing. The
canonical-JSON serializer is what makes cross-agent and cross-run hash
comparison meaningful.

## Code of conduct

Be direct. Be technical. Avoid hype. No emoji. No marketing language in code
or commits.
