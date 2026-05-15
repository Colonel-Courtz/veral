# CLAUDE.md — Veral project instructions

These instructions are MANDATORY for any AI agent working in this repository.

## Project state

**Veral** is the Verification Authority Layer for Ethereum. v1.0 in development. Codebase here is greenfield. A reference-only prior hackathon codebase lives at `/Users/danielbabjak/Desktop/ETHPrague2026/`; it contains AI bloat that must NOT be carried over.

## Hard rules (anti-bloat enforcement)

These rules are derived from a code review of the prior hackathon codebase. Every rule below was violated there. Do not violate them here.

### 1. Single source of truth per concept

- One engine registry. Not two.
- One score aggregator. Not two.
- One runner. Not two.
- One docs source of truth. Not three overlapping files.

If you find yourself building a "unified wrapper" around an existing system, **refactor the existing system instead**. Adding parallel abstractions is the most common AI failure mode.

### 2. No reference-tag comments

Do NOT write comments referencing tickets, user stories, gates, or epics:
- ❌ `// US-117 Multi-source orchestrator output shape`
- ❌ `// GATE-24 enforcement`
- ❌ `// EPIC §10.2 Seniority axis (LOCKED)`

Ticket references belong in PR descriptions, commit messages, and external trackers. They rot in the codebase. Use Linear / GitHub Issues for state.

### 3. Comments explain WHY, not WHAT

- ❌ `// Per-record evaluator for the com.github ENS text record. Reads at most two endpoints...`
- ✓ `// Self-asserted GitHub ownership — trust factor 0.6 until cross-sign ships.`

Well-named identifiers explain what. Comments earn their existence by explaining non-obvious constraints, subtle invariants, or workarounds.

### 4. No file-header description blocks

Do NOT write multi-paragraph file-leading comment blocks describing what the file does. Filename + exports are the documentation.

### 5. Single docs source of truth

- `README.md` — project surface for humans + AI
- `CLAUDE.md` — this file, AI-agent instructions
- `docs/architecture/` — design decisions, technical specs

Do NOT create: SCOPE.md, BRAINSTORM.md, AGENTS.md, EPIC_*.md, WIN.md at project root. Postmortems go to `docs/postmortems/`. Backlog goes to GitHub Issues / Linear, not markdown files.

### 6. Runtime data never in public/

`apps/web/public/` is statically served by Next.js. Cache, manifests, reports, and any other runtime-mutable data must NOT be committed there. Use:
- Vercel Blob for files
- Turso for relational data
- Upstash Redis for cache
- Vercel KV for ephemeral state

### 7. No paralelne abstractions

If feature X needs to integrate with system Y, modify system Y. Do not build system Y2 alongside it. Do not write a wrapper that "produces the same shape as Y so consumers don't change."

### 8. Test ratio targets

- Core logic packages (`packages/core`, `packages/score`, `packages/sources`): high coverage (~70%+)
- Presentational React components: only test non-trivial logic
- Do NOT auto-generate a `.test.tsx` for every component reflexively

## Standing rules (project-specific)

1. Slovak primary, English technical terms (Daniel's communication preference)
2. No emoji in code, in markdown, in commit messages
3. No "AI auditor" / "trust layer" / "smart contract scanner" / "Web3 platform" framing
4. Brand voice = calm institutional authority (verification authority archetype, NOT fintech disruptor)
5. Mocked paths labeled `mock: true`
6. Production EIP-712 signed reports verified against `veral.owner` ENS text record
7. Single-branch development; merge to `main` without delay
8. Never run `vercel deploy` / `vercel env add` / destructive git ops without explicit Daniel command
9. No tokens. No tokenomics. Veral is tokenless by principle.

## Twenty-source v1.0 target architecture

Veral v1.0 integrates 20 public evidence sources across 5 categories:

| Category | Sources |
|---|---|
| Code & Bytecode Verification | Sourcify, Etherscan/Blockscout, GitHub, NPM/PyPI |
| On-Chain Activity & Identity | Ethereum mainnet, ENS-internal, L2 deployments, EAS read |
| DeFi & Protocol Reputation | DefiLlama, EigenLayer, The Graph, Token registries |
| Identity & Sybil Resistance | Gitcoin Passport, POAP, Farcaster, Lens |
| Security & Audit | Code4rena, Immunefi, Tenderly, Safe multisig |

Each source lives in `packages/sources/src/<source>/`. Each source carries a `trust: 'verified' | 'unverified'` label that drives the structural trust-discount in the score formula.

## Three-tier certificate monetization

| Tier | Price | Source coverage |
|---|---|---|
| Public | $0.50–$2 | 4–6 sources verified |
| Anchored | $5–$20 | 12–15 sources verified |
| Sealed | $50–$500 | 18–20 sources verified + ZK proof + cross-sign |

Score lookup + breakdown panel + open-source formula remain free forever. Only certificate publishing is paid.

## Reference (read-only)

- Prior hackathon codebase: `/Users/danielbabjak/Desktop/ETHPrague2026/`
  - Use as reference for evidence-engine patterns, EAS schemas, Sourcify integration depth.
  - Do NOT copy file-header comment blocks, reference-tag comments, or parallel-abstraction patterns.
  - `packages/evidence/src/score/weights.ts` in that codebase carries the locked score formula — Veral v1.0 ports it forward unchanged for v1.0 P0.
