#!/usr/bin/env bash
# scripts/seed-issues.sh — generate initial backlog of P0 issues for Veral v1.0
# Run once after repo + labels + milestones are setup. Idempotency: re-running
# creates duplicates; verify before re-running.

set -euo pipefail

REPO="B2JK-Industry/veral"

create_issue() {
  local title="$1"
  local body="$2"
  local labels="$3"
  local milestone="$4"
  gh issue create --repo "$REPO" \
    --title "$title" \
    --body "$body" \
    --label "$labels" \
    --milestone "$milestone" \
    | tail -1
}

# ═══════════════════════════════════════════════════════════
# EPIC: foundation (M1)
# ═══════════════════════════════════════════════════════════

create_issue \
  "feat(shared): setup Turso libSQL database + Drizzle ORM schema" \
  "## Motivation
Veral needs durable state for cert records, audit log, payment records, subject manifest cache. Per ADR-000 we chose stateless API + DB transactions over workflow engine in v1.0.

## Proposal
Add Turso (libSQL) integration via Vercel Marketplace. Setup Drizzle ORM in \`@veral/shared/db/\`. Define schema for:
- \`certificates\` (per cert UID, subject, tier, score, validUntil, signer, evidenceBundleHash, previousUID, paymentTxHash)
- \`subjects\` (ENS namehash, last resolved at, manifest hash if signed)
- \`audit_log\` (append-only, per decision)
- \`payment_records\` (request_id, customer wallet, tx_hash, amount, token, chain_id, verified_at)

## Acceptance criteria
- [ ] Turso database provisioned via Vercel Marketplace (production + preview)
- [ ] Drizzle ORM installed and configured
- [ ] Initial schema in \`packages/shared/src/db/schema.ts\`
- [ ] Initial migration generated via \`drizzle-kit generate\`
- [ ] Migration applied to production Turso
- [ ] Connection helper in \`packages/shared/src/db/client.ts\`
- [ ] Smoke test: write + read a row

## References
- ADR-000 § State management
- packages/shared/AGENTS.md" \
  "kind:feature,tier:P0,package:shared,epic:foundation" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(shared): setup Upstash Redis cache adapter" \
  "## Motivation
Source fetches hit rate limits (GitHub 5k/hr, Etherscan 5/sec). Need aggressive caching with per-source TTL to stay within budgets and serve repeat queries fast.

## Proposal
Add Upstash Redis via Vercel Marketplace. Setup connection in \`packages/shared/src/cache/\`. Define typed helpers for per-source cache keys.

## Acceptance criteria
- [ ] Upstash Redis provisioned via Vercel Marketplace (production + preview)
- [ ] Connection client in \`packages/shared/src/cache/client.ts\`
- [ ] Typed helpers \`getCached<T>(key, ttl, fetcher)\` for source caching
- [ ] Default TTL constants per source category
- [ ] Cache invalidation on ENS record change webhook (stub for now)

## References
- ADR-000 § State management
- packages/sources/AGENTS.md § Rate limits" \
  "kind:feature,tier:P0,package:shared,epic:foundation" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(repo): provision Vercel env vars for all environments" \
  "## Motivation
The repo needs Alchemy, GitHub, Etherscan, EAS, operator wallet secrets configured in Vercel for production + preview + development.

## Proposal
Use \`vercel env add\` to set each variable. Document procedure for new contributors.

## Acceptance criteria
- [ ] \`ALCHEMY_API_KEY_MAINNET\` configured (production + preview)
- [ ] \`ALCHEMY_API_KEY_SEPOLIA\` configured
- [ ] \`ALCHEMY_API_KEY_BASE\` / \`_ARBITRUM\` / \`_OPTIMISM\` / \`_POLYGON\` configured
- [ ] \`GITHUB_TOKEN\` (PAT with read scope, no repo write) configured
- [ ] \`ETHERSCAN_API_KEY\` configured
- [ ] \`AI_GATEWAY_API_KEY\` (Vercel AI Gateway) configured
- [ ] \`REPORT_SIGNER_PRIVATE_KEY\` configured (operator wallet, single signer v1.0)
- [ ] \`COINGECKO_API_KEY\` configured
- [ ] \`.env.example\` updated to reflect all required vars
- [ ] \`docs/operations/env-vars.md\` documents each variable's purpose

## References
- ADR-002 § Payment infrastructure
- ADR-005 § Operator key custody (TBD)" \
  "kind:chore,tier:P0,package:web,epic:foundation" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(attest): generate operator burner wallet + fund testnet" \
  "## Motivation
v1.0 uses a single operator signing key (per ADR-005 lock). Need to generate, secure, fund the burner wallet on Sepolia + mainnet, and document the rotation procedure.

## Proposal
- Generate fresh EOA via \`cast wallet new\` on Daniel's machine, never commit
- Fund Sepolia from public faucet (~0.5 ETH for testing)
- Fund mainnet with minimal gas budget (\$50 of ETH for first attestations)
- Document address in \`docs/operations/operator-wallet.md\`
- Document rotation procedure (quarterly + emergency)

## Acceptance criteria
- [ ] Wallet generated, private key stored in Vercel \`REPORT_SIGNER_PRIVATE_KEY\` env (production)
- [ ] Sepolia balance ≥ 0.5 ETH for testing
- [ ] Mainnet balance ≥ 0.02 ETH (\$50 at current price) for first issuances
- [ ] Operator address published in \`docs/operations/operator-wallet.md\` (transparency)
- [ ] Rotation procedure documented (steps, conditions, comms plan)
- [ ] Address added as \`veral.owner\` record on demo ENS subnames

## References
- ADR-002 § Payment infrastructure
- ADR-005 § Operator key custody" \
  "kind:feature,tier:P0,package:attest,epic:foundation,kind:security" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(attest): register EAS schema veral.cert.v1 on mainnet + Sepolia" \
  "## Motivation
Per Q11 lock: unified EAS schema veral.cert.v1 covers all tiers. Need one-time registration per network. UIDs become constants in \`packages/attest/src/eas/uids.ts\`.

## Proposal
- Write \`scripts/eas/register-schema.ts\` that registers the canonical Veral cert schema
- Run against Sepolia first (testing), then mainnet
- Capture returned UIDs, commit to \`packages/attest/src/eas/uids.ts\`

## Schema definition (LOCKED)
\`\`\`
bytes32 subjectNamehash,
string subjectEnsName,
uint8 tier,
uint16 score,
string scoreFormulaVersion,
uint64 issuedAt,
uint64 validUntil,
bytes32 evidenceBundleHash,
bytes32 aiProvenanceHash,
bytes32 forensicHash,
address signer,
bytes32 previousUID
\`\`\`

## Acceptance criteria
- [ ] Schema registered on Sepolia (record UID)
- [ ] Schema registered on mainnet (record UID)
- [ ] UIDs committed to \`packages/attest/src/eas/uids.ts\` per network
- [ ] Schema metadata published in \`docs/architecture/006-eas-schema.md\`
- [ ] Smoke test: encode + decode a sample attestation payload

## References
- ADR-001 § Tier methodology
- ADR-003 § Revocation/expiry" \
  "kind:feature,tier:P0,package:attest,epic:foundation,epic:attest" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(repo): setup Sentry error tracking for veral.tech" \
  "## Motivation
Production needs error visibility. Sentry free tier covers small-scale needs; add @sentry/nextjs to apps/web.

## Acceptance criteria
- [ ] Sentry project created
- [ ] \`@sentry/nextjs\` installed in apps/web
- [ ] DSN configured via Vercel env var
- [ ] Source maps uploaded on build
- [ ] First test error captured + visible in Sentry dashboard

## References
- TIER 2 enterprise readiness audit § Reliability & monitoring" \
  "kind:feature,tier:P1,package:web,epic:foundation" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(repo): setup public status page at status.veral.tech" \
  "## Motivation
Customers and ENS DAO reviewers want transparency on uptime. Better Stack or Statuspage offer free public status pages.

## Acceptance criteria
- [ ] Status page tool selected (recommend Better Stack)
- [ ] Account created and configured
- [ ] Monitor endpoints added (veral.tech, /api/bench/[name], /api/cert/[uid])
- [ ] Public page accessible at status.veral.tech (CNAME)
- [ ] Incident communication procedure documented" \
  "kind:feature,tier:P1,package:web,epic:foundation" \
  "M2: Anchored-tier v1 (Jul 2026)"

# ═══════════════════════════════════════════════════════════
# EPIC: score-engine (M1)
# ═══════════════════════════════════════════════════════════

create_issue \
  "feat(score): port @veral/score scaffold + tier ceiling logic" \
  "## Motivation
Score formula v1.0 is locked per ADR-001 + Q1 (methodology depth). Port the LOCKED weights + components from the prior hackathon codebase to fresh \`packages/score/\` with versioned structure.

## Proposal
- Setup \`packages/score/\` workspace
- Create \`src/versions/v1.0/\` directory
- Port \`weights.ts\` byte-identical from prior hackathon \`packages/evidence/src/score/weights.ts\`
- Port \`components.ts\` aggregation logic
- Port \`engine.ts\` orchestration
- Strip all reference-tag comments (US-XXX, GATE-XXX) per CLAUDE.md
- Add version export from \`src/index.ts\`

## Acceptance criteria
- [ ] \`packages/score/\` workspace registered in pnpm-workspace.yaml
- [ ] \`src/versions/v1.0/weights.ts\` matches prior hackathon weights byte-identical (TRUST_DISCOUNT_UNVERIFIED = 0.6, axis weights, tier thresholds)
- [ ] \`src/versions/v1.0/components.ts\` ports per-component compute
- [ ] \`src/versions/v1.0/engine.ts\` ports aggregation
- [ ] \`src/index.ts\` exports \`computeForVersion('v1.0')\`
- [ ] No reference-tag comments anywhere
- [ ] No file-header description blocks
- [ ] Compiles with strict TypeScript

## References
- ADR-001 § Tier methodology
- packages/score/AGENTS.md
- CLAUDE.md anti-bloat rules" \
  "kind:feature,tier:P0,package:score,epic:score-engine" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(score): add golden-file tests for v1.0 score computation" \
  "## Motivation
Determinism is the foundation of audit trust. Customers must be able to re-derive any score byte-for-byte. Golden-file tests prevent silent regressions.

## Proposal
- Create \`packages/score/src/versions/v1.0/__tests__/golden.test.ts\`
- Define fixed EvidenceBundle inputs (e.g. \"strong subject\", \"medium subject\", \"weak subject\", \"public-read fallback\")
- Define expected ScoreResult outputs (score, tier, breakdown)
- Assert byte-identical match

## Acceptance criteria
- [ ] 5+ golden fixtures covering edge cases (strong, medium, weak, public-read, empty)
- [ ] Test fails if score formula changes
- [ ] Coverage of all tier ceiling boundary conditions (Public/A, A/B, B/C, C/D)
- [ ] CI runs these tests on every PR

## References
- packages/score/AGENTS.md § Test expectations" \
  "kind:test,tier:P0,package:score,epic:score-engine" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(score): property-based tests for axis weight invariants" \
  "## Motivation
Mathematical invariants of the score formula (sum of weights = 1.0, score in [0,100], tier monotonic in score) should be enforced by property tests, not just examples.

## Proposal
Use \`fast-check\` for property-based testing.

## Acceptance criteria
- [ ] Property: seniority axis weights sum to 1.0
- [ ] Property: relevance axis weights sum to 1.0
- [ ] Property: score always in [0, 100] for any EvidenceBundle
- [ ] Property: tier is monotonically decreasing with score (S < A < B < C < D)
- [ ] Property: trust-discount only reduces score, never increases" \
  "kind:test,tier:P0,package:score,epic:score-engine" \
  "M1: Brand launch (Jun 2026)"

# ═══════════════════════════════════════════════════════════
# EPIC: authority-package (M1-M2)
# ═══════════════════════════════════════════════════════════

create_issue \
  "feat(authority): scaffold @veral/authority package structure" \
  "## Motivation
Per ADR-001 + Q8, the authority package is the single source of truth for cert decisions. Create the directory skeleton per AGENTS.md.

## Acceptance criteria
- [ ] \`packages/authority/\` workspace registered
- [ ] Directory structure created per AGENTS.md:
  - tier-rules/
  - policy/
  - analysis/orchestrator + registry + synthesis/
  - issuance/
  - revocation/
  - audit-trail/
  - schema/
- [ ] Each directory has \`index.ts\` (empty re-exports OK)
- [ ] package.json + tsconfig.json setup
- [ ] Compiles with strict TypeScript

## References
- packages/authority/AGENTS.md" \
  "kind:feature,tier:P0,package:authority,epic:authority-package" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(authority): implement tier-rules for Public + Anchored + Sealed" \
  "## Motivation
Per Q1 lock, tier eligibility is methodology-depth-based. Implement deterministic eligibility check for each tier.

## Acceptance criteria
- [ ] \`tier-rules/public-tier.ts\` — checks deterministic source coverage (no AI, just on-chain + ENS native sources)
- [ ] \`tier-rules/anchored-tier.ts\` — Public eligibility + AI feasibility (manifest signed, source content available for LLM)
- [ ] \`tier-rules/sealed-tier.ts\` — Anchored eligibility + forensic source coverage (OpenCorporates accessible, etc)
- [ ] Each rule returns \`TierEligibilityResult { eligible: boolean, reason: string, missing?: string[] }\`
- [ ] Unit tests for each tier rule with mock EvidenceBundle inputs

## References
- ADR-001 § Tier methodology
- packages/authority/AGENTS.md" \
  "kind:feature,tier:P0,package:authority,epic:authority-package" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(authority): implement 90% agent success threshold policy" \
  "## Motivation
Per Q4 lock, orchestrator requires 90% of applicable agents to succeed before cert issuance. Below threshold → refuse + auto-retry within 1 hour.

## Acceptance criteria
- [ ] \`policy/thresholds.ts\` exports \`MIN_AGENT_SUCCESS_RATIO = 0.9\`
- [ ] Tier-specific applicable agent count helper
- [ ] Threshold check function: \`(results: AgentResult[]) => { passes: boolean, succeeded: number, total: number }\`
- [ ] Cert payload includes \`agentsSucceeded\` + \`agentsTotal\` fields for transparency
- [ ] Auto-retry queue logic (stub for now; integrates with @veral/core)

## References
- ADR-001
- packages/authority/AGENTS.md" \
  "kind:feature,tier:P0,package:authority,epic:authority-package" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(authority): implement tier-specific manifest verification policy" \
  "## Motivation
Per Q13 lock: Public ignores manifest, Anchored degrades to public-read + tier A ceiling on fail, Sealed strict refuse + auto-refund.

## Acceptance criteria
- [ ] \`policy/manifest-verification.ts\` exports per-tier verify function
- [ ] Public tier: skip verification, always use public-read path
- [ ] Anchored: verify EIP-712 sig; on fail, downgrade to public-read + cap tier at A
- [ ] Sealed: verify EIP-712 sig; on fail, refuse cert + trigger refund
- [ ] Tests cover all 3 tier paths × pass/fail" \
  "kind:feature,tier:P0,package:authority,epic:authority-package" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(authority): implement tier-specific request TTL" \
  "## Motivation
Per Q3 lock: Public 15min, Anchored 30min, Sealed 24h.

## Acceptance criteria
- [ ] \`policy/ttl.ts\` exports \`TIER_TTL_SECONDS\` constants
- [ ] Helper \`computeExpiresAt(tier, now): Date\`
- [ ] DB schema enforces \`cert_requests.expires_at\`
- [ ] Background job marks expired requests as \`ABANDONED\`
- [ ] Tests verify each tier" \
  "kind:feature,tier:P0,package:authority,epic:authority-package" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(authority): implement algorithmic orchestrator with parallel agent execution" \
  "## Motivation
Per ADR-004, orchestrator is pure deterministic code that runs scoped agents in parallel and aggregates structured findings. No LLM-as-judge in orchestrator.

## Acceptance criteria
- [ ] \`analysis/orchestrator.ts\` exports \`orchestrate(input)\`
- [ ] Reads tier request from input
- [ ] Looks up applicable agents from \`registry.ts\`
- [ ] Runs all agents in \`Promise.all\` (parallel)
- [ ] Per-agent timeout enforcement (default 30s, configurable per agent)
- [ ] Aggregates results, returns OrchestrationOutput
- [ ] Failure isolation: one agent failing doesn't block others
- [ ] Tests with mock agents (happy path, partial failure, all fail)

## References
- ADR-004 § Architecture
- packages/authority/AGENTS.md" \
  "kind:feature,tier:P0,package:authority,epic:agent-architecture,epic:authority-package" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(authority): implement single agent registry (singleton, lint-enforced)" \
  "## Motivation
Per ADR-004 + CLAUDE.md rule 1: one agent registry. Adding a parallel registry pattern is a CI failure (lessons from prior hackathon bloat).

## Acceptance criteria
- [ ] \`analysis/registry.ts\` exports singleton \`agentRegistry\`
- [ ] Methods: \`register(agent)\`, \`getAgentsForTier(tier)\`, \`listRegisteredAgents()\`
- [ ] Registration happens at module load only (no runtime mutation)
- [ ] Throws if same agent ID registered twice
- [ ] Tests

## References
- ADR-004
- CLAUDE.md rule 1" \
  "kind:feature,tier:P0,package:authority,epic:agent-architecture" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(authority): cross-source synthesis engine for Sealed tier" \
  "## Motivation
Per Q8 lock: Sealed tier requires cross-source correlation (beneficial ownership match, timeline correlation, sanctions cross-check). This happens in \`synthesis/\` as pure deterministic TypeScript — no LLM.

## Acceptance criteria
- [ ] \`analysis/synthesis/engine.ts\` runs synthesis rules sequentially over aggregated findings
- [ ] \`analysis/synthesis/rules/beneficial-ownership.ts\` — matches OpenCorporates directors vs GitHub claim
- [ ] \`analysis/synthesis/rules/timeline-correlation.ts\` — checks entity registration date vs on-chain first tx
- [ ] \`analysis/synthesis/rules/sanctions-cross-check.ts\` — OFAC SDN list match against any associated address
- [ ] Each rule: pure function \`(findings: AllAgentFindings) => CorrelationResult\`
- [ ] Output: structured CorrelationResult[] attached to Sealed cert payload
- [ ] No LLM imports
- [ ] Tests with fixture findings

## References
- ADR-004 § Architecture
- Q8 lock: algorithmic synthesis" \
  "kind:feature,tier:P0,package:authority,epic:authority-package" \
  "M5: Sealed-tier v1 (Oct 2026)"

create_issue \
  "feat(authority): issuance payload builder per tier" \
  "## Motivation
Each tier produces a slightly different EAS attestation payload (Sealed includes forensicHash; Anchored includes aiProvenanceHash; Public has neither).

## Acceptance criteria
- [ ] \`issuance/payload-builder.ts\` exports tier-specific builders
- [ ] Public payload: minimal fields, no AI hash, no forensic hash
- [ ] Anchored payload: + aiProvenanceHash from agent results
- [ ] Sealed payload: + forensicHash from synthesis results
- [ ] All payloads include: subjectNamehash, subjectEnsName, tier, score, validUntil, signer, evidenceBundleHash, previousUID (nullable)
- [ ] Tests for each tier

## References
- ADR-003 § Schema
- Q11 lock: unified EAS schema with nullable tier-specific fields" \
  "kind:feature,tier:P0,package:authority,epic:authority-package" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(authority): final eligibility gate before signing" \
  "## Motivation
Last check before \`@veral/attest\` signs: verify tier eligibility passed, payment verified, agent threshold met, manifest verification passed per tier policy.

## Acceptance criteria
- [ ] \`issuance/eligibility-gate.ts\` returns \`{ pass: true } | { pass: false, reason: string }\`
- [ ] Checks: tierEligibility, paymentVerified, agentsSucceededRatio >= 0.9, manifestVerificationPassed
- [ ] All failures logged to audit-trail with reason
- [ ] Tests cover all rejection paths" \
  "kind:feature,tier:P0,package:authority,epic:authority-package" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(authority): append-only audit log" \
  "## Motivation
Every cert-related decision (eligibility, issuance, refusal, dispute) is logged. Immutable, append-only.

## Acceptance criteria
- [ ] \`audit-trail/log.ts\` exports \`logDecision(input)\` function
- [ ] DB table \`audit_log\` (append-only via trigger or convention)
- [ ] Each entry: timestamp, decision type, subject, tier, reason, actor (operator address), input hash
- [ ] No update, no delete operations exposed
- [ ] Query helper for audit replay
- [ ] Tests" \
  "kind:feature,tier:P0,package:authority,epic:authority-package,kind:security" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(authority): 12-month time-bound cert expiry" \
  "## Motivation
Per ADR-003: certs expire 12 months after issuance, no on-chain revocation in v1.0.

## Acceptance criteria
- [ ] \`revocation/expiry.ts\` exports \`CERT_VALIDITY_DAYS = 365\` constant
- [ ] Helper \`computeValidUntil(issuedAt)\`
- [ ] Helper \`isExpired(validUntil, now)\`
- [ ] EAS attestation payload always includes \`validUntil\` field
- [ ] Tests" \
  "kind:feature,tier:P0,package:authority,epic:authority-package" \
  "M1: Brand launch (Jun 2026)"

# ═══════════════════════════════════════════════════════════
# EPIC: sources (M1-M5)
# ═══════════════════════════════════════════════════════════

create_issue \
  "feat(sources): scaffold @veral/sources package + agent base interfaces" \
  "## Motivation
Per ADR-004 + AGENTS.md, the sources package contains scoped agents. Set up the directory structure for 20 agents (extractors / ai-analysis / forensic).

## Acceptance criteria
- [ ] \`packages/sources/\` workspace registered
- [ ] Directory structure: agents/extractors/, agents/ai-analysis/, agents/forensic/
- [ ] Base \`SourceAgent<TFindings>\` from \`@veral/shared\` (already exists)
- [ ] Per-category index.ts files (empty re-exports initially)
- [ ] Package compiles" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(sources): Sourcify extractor agent" \
  "## Motivation
Sourcify is the only verified (full-trust) seniority source. First and most critical extractor agent.

## Acceptance criteria
- [ ] \`agents/extractors/sourcify/agent.ts\` implements \`SourceAgent<SourcifyFindings>\`
- [ ] \`schema.ts\` Zod schema for findings (match/abi/storage/compilation/metadata)
- [ ] \`client.ts\` Sourcify v2 API client (verifying contract, getting attestation chain)
- [ ] Cache TTL 24h via @veral/shared/cache
- [ ] Mocked unit tests + fixture-based integration tests
- [ ] Provenance: \`backend: { kind: 'rest-api', baseUrl: 'sourcify.dev/server', version: 'v2' }\`
- [ ] Coverage 70%+" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(sources): GitHub extractor agent (P0 endpoints)" \
  "## Motivation
GitHub is the largest unverified-source signal (×0.6 trust). Need user + repo + test-dir + README + LICENSE probes.

## Acceptance criteria
- [ ] \`agents/extractors/github/agent.ts\` implements SourceAgent
- [ ] Endpoints: /users/{owner}, /users/{owner}/repos (top 20 by recency), /repos/{o}/{r}, repo contents probes
- [ ] Findings: testPresence, repoHygiene (README+LICENSE), pushed_at recency
- [ ] Rate-limit budget: ~6 calls/repo × 20 repos + 2 user = ~122 calls per evaluation
- [ ] Trust factor 0.6
- [ ] Authenticated via GITHUB_TOKEN env
- [ ] Tests" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(sources): Ethereum on-chain extractor agent" \
  "## Motivation
On-chain activity (first tx, nonce, contracts deployed) is full-trust (×1.0). RPC reads via viem.

## Acceptance criteria
- [ ] \`agents/extractors/ethereum/agent.ts\` implements SourceAgent
- [ ] Reads: nonce via eth_getTransactionCount, first tx via binary search, contracts deployed via Sourcify deployer crosswalk
- [ ] Uses Alchemy mainnet RPC
- [ ] Cache TTL 5min
- [ ] Tests" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(sources): ENS-internal extractor agent" \
  "## Motivation
ENS records age, subname count, text records richness, last TextChanged block — all full-trust signals.

## Acceptance criteria
- [ ] \`agents/extractors/ens/agent.ts\` implements SourceAgent
- [ ] Reads via ENSjs + The Graph subgraph
- [ ] Findings: registration date, subname count, text records count, last update block
- [ ] Cache TTL 5min
- [ ] Tests" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(sources): EAS attestations read agent (existing attestations)" \
  "## Motivation
Reading existing EAS attestations for a subject reveals identity attestors, audit firms, KYC providers — strong identity signals.

## Acceptance criteria
- [ ] \`agents/extractors/eas/agent.ts\` reads via EAS SDK
- [ ] Filters by trusted issuer list (configurable)
- [ ] Cache TTL 1h
- [ ] Tests" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(sources): Etherscan verified contract cross-check agent" \
  "## Motivation
Etherscan labels deployed contracts as verified or unverified. Cross-check Sourcify findings.

## Acceptance criteria
- [ ] \`agents/extractors/etherscan/agent.ts\` reads via Etherscan API
- [ ] Findings: verified contract status, contract labels, deployer address
- [ ] Trust factor 0.6 (centralized data source)
- [ ] Cache TTL 24h
- [ ] Tests" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(sources): Layer-2 deployments crosswalk agent" \
  "## Motivation
Cross-chain footprint (Arbitrum, Optimism, Base, Linea, zkSync, Polygon) is a strong adoption signal.

## Acceptance criteria
- [ ] \`agents/extractors/l2-deployments/agent.ts\` queries each L2's RPC
- [ ] Per-chain: deployed contracts list, total tx count
- [ ] Returns: \`{ [chainName]: { contracts: number, txs: number } }\`
- [ ] Multi-chain Alchemy RPC keys per env var
- [ ] Cache TTL 1h" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(sources): NPM/PyPI publishing reputation agent" \
  "## Motivation
NPM/PyPI package publishing reputation (download counts, package count, dependency relationships) is a developer-quality signal.

## Acceptance criteria
- [ ] \`agents/extractors/npm/agent.ts\` queries NPM registry API
- [ ] Findings: published packages count, total downloads, recency
- [ ] Trust factor 0.6
- [ ] Cache TTL 24h" \
  "kind:feature,tier:P1,package:sources,epic:sources" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(sources): DefiLlama protocol metrics agent" \
  "## Motivation
DefiLlama is the canonical DeFi protocol metrics aggregator (TVL, fees, revenue).

## Acceptance criteria
- [ ] \`agents/extractors/defillama/agent.ts\` queries DefiLlama API
- [ ] Findings: TVL, fees 30d, protocol metrics
- [ ] Trust factor 1.0 (open public data)
- [ ] Cache TTL 1h" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M3: First paid pilot (Aug 2026)"

create_issue \
  "feat(sources): EigenLayer AVS participation agent" \
  "## Motivation
EigenLayer AVS participation indicates Ethereum-aligned infrastructure commitment.

## Acceptance criteria
- [ ] \`agents/extractors/eigenlayer/agent.ts\` queries EigenLayer API
- [ ] Findings: AVS membership, total delegated stake, operator set
- [ ] Cache TTL 1h" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M3: First paid pilot (Aug 2026)"

create_issue \
  "feat(sources): The Graph subgraph health agent" \
  "## Motivation
The Graph subgraph indexing presence and query volume indicates production protocol maturity.

## Acceptance criteria
- [ ] \`agents/extractors/thegraph/agent.ts\` queries The Graph
- [ ] Findings: indexed subgraphs, query volume, indexer count
- [ ] Cache TTL 1h" \
  "kind:feature,tier:P1,package:sources,epic:sources" \
  "M3: First paid pilot (Aug 2026)"

create_issue \
  "feat(sources): token registries listing status agent" \
  "## Motivation
Uniswap default list / 1inch token list / CoinGecko inclusion indicates community-vetted token status.

## Acceptance criteria
- [ ] \`agents/extractors/tokenlists/agent.ts\` checks multiple registries
- [ ] Findings: listed-on-Uniswap-default, listed-on-1inch, CoinGecko coverage
- [ ] Cache TTL 24h" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M3: First paid pilot (Aug 2026)"

create_issue \
  "feat(sources): Gitcoin Passport stamps agent" \
  "## Motivation
Gitcoin Passport aggregates sybil-resistance signals from multiple issuers.

## Acceptance criteria
- [ ] \`agents/extractors/passport/agent.ts\` queries Gitcoin Passport API
- [ ] Findings: stamp count, stamp diversity, score
- [ ] Trust factor 0.6 (subject-claimed identity)
- [ ] Cache TTL 1h" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M4: Identity dimension (Sep 2026)"

create_issue \
  "feat(sources): POAP event participation agent" \
  "## Motivation
POAPs indicate event participation, community membership signals.

## Acceptance criteria
- [ ] \`agents/extractors/poap/agent.ts\` queries POAP API
- [ ] Findings: POAP count, event diversity, recency
- [ ] Trust factor 0.6
- [ ] Cache TTL 24h" \
  "kind:feature,tier:P1,package:sources,epic:sources" \
  "M4: Identity dimension (Sep 2026)"

create_issue \
  "feat(sources): Farcaster activity agent" \
  "## Motivation
Farcaster FID activity (account age, follower quality, casts) is a decentralized social signal.

## Acceptance criteria
- [ ] \`agents/extractors/farcaster/agent.ts\` queries Farcaster Hub
- [ ] Findings: FID, account age, cast count, follower quality
- [ ] Trust factor 0.6
- [ ] Cache TTL 1h" \
  "kind:feature,tier:P1,package:sources,epic:sources" \
  "M4: Identity dimension (Sep 2026)"

create_issue \
  "feat(sources): Lens Protocol social graph agent" \
  "## Motivation
Lens Protocol profile + social graph on Polygon is a complementary decentralized social signal.

## Acceptance criteria
- [ ] \`agents/extractors/lens/agent.ts\` queries Lens API
- [ ] Findings: profile id, follower count, content count
- [ ] Trust factor 0.6
- [ ] Cache TTL 1h" \
  "kind:feature,tier:P1,package:sources,epic:sources" \
  "M4: Identity dimension (Sep 2026)"

create_issue \
  "feat(sources): Code4rena audit history agent" \
  "## Motivation
Code4rena audit competitions are gold-standard security audit signals.

## Acceptance criteria
- [ ] \`agents/extractors/code4rena/agent.ts\` queries C4 API or scraper
- [ ] Findings: audits participated, severity findings handled, payout history
- [ ] Trust factor 0.6
- [ ] Cache TTL 7d" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M5: Sealed-tier v1 (Oct 2026)"

create_issue \
  "feat(sources): Immunefi bug bounty engagement agent" \
  "## Motivation
Immunefi active bug bounty engagement indicates security maturity.

## Acceptance criteria
- [ ] \`agents/extractors/immunefi/agent.ts\` queries Immunefi API
- [ ] Findings: active bounty programs, payout history, severity tiers
- [ ] Trust factor 0.6
- [ ] Cache TTL 7d" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M5: Sealed-tier v1 (Oct 2026)"

create_issue \
  "feat(sources): Tenderly monitoring presence agent" \
  "## Motivation
Tenderly monitoring + alerting indicates production-grade ops.

## Acceptance criteria
- [ ] \`agents/extractors/tenderly/agent.ts\` queries Tenderly API
- [ ] Findings: monitored contracts, alert rules count
- [ ] Trust factor 0.6
- [ ] Cache TTL 1d" \
  "kind:feature,tier:P1,package:sources,epic:sources" \
  "M5: Sealed-tier v1 (Oct 2026)"

create_issue \
  "feat(sources): Safe multisig governance agent" \
  "## Motivation
Safe multisig signer composition reveals governance structure (single-key, 2-of-3, N-of-M).

## Acceptance criteria
- [ ] \`agents/extractors/safe/agent.ts\` queries Safe API
- [ ] Findings: signer count, threshold, signer addresses (anonymized)
- [ ] Trust factor 1.0 (on-chain truth)
- [ ] Cache TTL 1h" \
  "kind:feature,tier:P0,package:sources,epic:sources" \
  "M5: Sealed-tier v1 (Oct 2026)"

# ═══════════════════════════════════════════════════════════
# EPIC: attest (M1-M2)
# ═══════════════════════════════════════════════════════════

create_issue \
  "feat(attest): scaffold @veral/attest package + EIP-712 typed-data schema" \
  "## Motivation
Per ADR-002 + ADR-008, attest is the signing primitive. Define canonical EIP-712 typed-data schema for Veral cert.

## Acceptance criteria
- [ ] \`packages/attest/\` workspace registered
- [ ] \`src/eip712/typed-data.ts\` exports canonical schema
- [ ] \`src/eip712/sign.ts\` exports operator signing function (reads REPORT_SIGNER_PRIVATE_KEY)
- [ ] \`src/eip712/verify.ts\` exports public verification function (returns signer address)
- [ ] Unit tests" \
  "kind:feature,tier:P0,package:attest,epic:attest" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(attest): EAS publish + read primitives" \
  "## Motivation
Submit attestations to EAS contract and read them back.

## Acceptance criteria
- [ ] \`src/eas/publish.ts\` submits attestation via EAS SDK
- [ ] \`src/eas/read.ts\` retrieves attestation by UID
- [ ] Multi-chain support (mainnet + Sepolia for v1.0)
- [ ] Error handling (network failure, schema mismatch, insufficient gas)
- [ ] Tests" \
  "kind:feature,tier:P0,package:attest,epic:attest" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(attest): payment forwarder event listener + tx verification" \
  "## Motivation
Per Q2 lock: VeralPaymentForwarder.sol emits PaymentReceived events. Backend listens, matches requestId, triggers cert issuance.

## Acceptance criteria
- [ ] \`src/payment/forwarder-events.ts\` subscribes to PaymentReceived events
- [ ] Per-chain subscription (mainnet + L2s)
- [ ] On event: match requestId to pending request, verify amount within 1% tolerance, mark PAID
- [ ] Idempotency: replay safe
- [ ] Tests with mock event emissions" \
  "kind:feature,tier:P0,package:attest,epic:attest" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(attest): CoinGecko USD/ETH price oracle adapter" \
  "## Motivation
Per Q9 lock: USDC + ETH with CoinGecko oracle locked at request time.

## Acceptance criteria
- [ ] \`src/payment/price-oracle.ts\` fetches ETH/USD from CoinGecko API
- [ ] Caches rate for TTL duration (15min Public, 30min Anchored, 24h Sealed)
- [ ] DB schema stores \`eth_usd_rate_at_request\` per request
- [ ] Verification helper: \`isWithinTolerance(actualAmount, expectedUsd, rate, tolerance=0.01)\`
- [ ] Tests" \
  "kind:feature,tier:P0,package:attest,epic:attest" \
  "M2: Anchored-tier v1 (Jul 2026)"

# ═══════════════════════════════════════════════════════════
# EPIC: contracts (M1)
# ═══════════════════════════════════════════════════════════

create_issue \
  "feat(contracts): VeralPaymentForwarder.sol — minimal payment forwarder contract" \
  "## Motivation
Per Q2 lock: forwarder contract handles ERC-20 (USDC) and ETH payments, emits PaymentReceived event with requestId for binding.

## Acceptance criteria
- [ ] \`contracts/src/VeralPaymentForwarder.sol\` implements forwarder
- [ ] Functions: \`pay(token, amount, requestId)\` for ERC-20, \`payNative(requestId)\` for ETH
- [ ] Emits \`PaymentReceived(payer, token, amount, requestId)\`
- [ ] Forwards funds to operator receiving address
- [ ] No mutable state beyond constructor-set receiver
- [ ] Foundry tests" \
  "kind:feature,tier:P0,package:contracts,epic:contracts,kind:security" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(contracts): CREATE2 deterministic deploy script for VeralPaymentForwarder" \
  "## Motivation
Same address across mainnet + Base + Arbitrum + Optimism + Polygon via CREATE2.

## Acceptance criteria
- [ ] \`scripts/deploy/Forwarder.s.sol\` Foundry deploy script
- [ ] Uses Safe Singleton Factory or equivalent
- [ ] Salt derivation documented in script comments
- [ ] Deployed to Sepolia first (testing)
- [ ] Verified on Etherscan / equivalent block explorers per chain" \
  "kind:feature,tier:P0,package:contracts,epic:contracts" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(contracts): VeralPaymentForwarder smart contract audit (external)" \
  "## Motivation
Forwarder handles customer payments. Required external audit before mainnet deploy. Even minimal contract requires this for trust.

## Acceptance criteria
- [ ] Audit firm engaged (Code4rena, Spearbit, or similar)
- [ ] Findings addressed
- [ ] Audit report published in \`docs/audits/\`
- [ ] Mainnet deploy gated on clean audit" \
  "kind:feature,tier:P0,package:contracts,epic:contracts,kind:security" \
  "M2: Anchored-tier v1 (Jul 2026)"

# ═══════════════════════════════════════════════════════════
# EPIC: legal (M1)
# ═══════════════════════════════════════════════════════════

create_issue \
  "feat(legal): foreign incorporation (Estonia OÜ / Switzerland / Singapore)" \
  "## Motivation
Production launch requires legal entity for B2B contracts, banking, IP holding.

## Acceptance criteria
- [ ] Jurisdiction selected (Estonia e-Residency recommended for solo founder + remote team)
- [ ] Entity incorporated
- [ ] Banking opened (Mercury / Wise / Revolut Business)
- [ ] EIN / tax ID obtained
- [ ] Listed in \`docs/operations/legal-entity.md\`" \
  "kind:chore,tier:P0,epic:legal" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(legal): co-founder agreement (Daniel + 3 co-founders)" \
  "## Motivation
Equity split, vesting, IP assignment, voting rights formalized before production launch.

## Acceptance criteria
- [ ] Cap table defined (Daniel + Davyd + Kyryl + Artem)
- [ ] Vesting schedule documented (4-year, 1-year cliff)
- [ ] IP assignment clauses (work product to entity)
- [ ] Voting rights for major decisions
- [ ] Document signed by all parties
- [ ] Linked from \`docs/operations/team.md\`" \
  "kind:chore,tier:P0,epic:legal" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(legal): Privacy Policy + Terms of Service + Cookie Policy" \
  "## Motivation
Customer-facing legal pages required for production launch.

## Acceptance criteria
- [ ] \`apps/web/app/legal/privacy/page.mdx\` — GDPR + CCPA compliant
- [ ] \`apps/web/app/legal/terms/page.mdx\` — cert issuance terms, refund, disclaimer, dispute resolution
- [ ] \`apps/web/app/legal/cookies/page.mdx\` — cookie usage disclosure
- [ ] Cookie consent banner integrated (Cookiebot free tier)
- [ ] Reviewed by external legal counsel" \
  "kind:feature,tier:P0,package:web,epic:legal" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(legal): OFAC sanctions screening integration" \
  "## Motivation
Every cert issuance must check subject against OFAC SDN list before signing. Regulatory requirement for US-exposed business.

## Acceptance criteria
- [ ] OFAC SDN list integration (free public API)
- [ ] Pre-issuance check: subject's primary address + ENS owner address against SDN
- [ ] On match: refuse cert + log + customer notification (no refund per ToS)
- [ ] Audit log entry per check
- [ ] Tests" \
  "kind:feature,tier:P0,package:authority,epic:legal,kind:security" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(legal): MiCA compliance assessment" \
  "## Motivation
EU MiCA regulation (effective 2024-2026) — confirm Veral is NOT a CASP (crypto-asset service provider). External legal review required.

## Acceptance criteria
- [ ] Legal counsel engaged for MiCA review
- [ ] Opinion letter confirming non-CASP status (or path to compliance if CASP)
- [ ] Findings documented in \`docs/legal/mica-assessment.md\`
- [ ] Operational adjustments if needed" \
  "kind:chore,tier:P0,epic:legal" \
  "M3: First paid pilot (Aug 2026)"

# ═══════════════════════════════════════════════════════════
# EPIC: core + web-routes (M1-M3)
# ═══════════════════════════════════════════════════════════

create_issue \
  "feat(core): scaffold @veral/core + subject-resolver" \
  "## Motivation
Per packages/core/AGENTS.md: gateway between HTTP and analysis. Subject resolver is the first piece.

## Acceptance criteria
- [ ] \`packages/core/\` workspace registered
- [ ] \`src/subject-resolver/resolve.ts\` — ENS namehash to SubjectManifest
- [ ] \`src/subject-resolver/manifest-parse.ts\` — parse veral.bench-manifest JSON
- [ ] \`src/subject-resolver/manifest-verify.ts\` — EIP-712 sig check against veral.owner
- [ ] \`src/subject-resolver/public-read-fallback.ts\` — infer manifest from addr() + Sourcify all-chains
- [ ] Tests covering all paths" \
  "kind:feature,tier:P0,package:core,epic:foundation" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(core): orchestration entry points (issue-cert, recompute-score, status)" \
  "## Motivation
Public API surface for apps/web to consume.

## Acceptance criteria
- [ ] \`src/orchestration/issue-cert.ts\` — full cert flow entry
- [ ] \`src/orchestration/recompute-score.ts\` — free public score lookup
- [ ] \`src/orchestration/status.ts\` — async cert status query (Sealed tier)
- [ ] Type-safe inputs / outputs
- [ ] Tests" \
  "kind:feature,tier:P0,package:core,epic:foundation" \
  "M1: Brand launch (Jun 2026)"

create_issue \
  "feat(web): /b/[name] Bench Mode UI" \
  "## Motivation
Primary user surface — type ENS name, see public Veral score + breakdown.

## Acceptance criteria
- [ ] \`apps/web/app/b/[name]/page.tsx\` — Server Component
- [ ] Score banner (0-100, tier badge, validity)
- [ ] Source grid (4 categories × source tiles)
- [ ] Breakdown drawer (per-component contributions)
- [ ] Trust-discount visible per signal
- [ ] Loading state
- [ ] Error states (subject not found, ENS unresolvable)
- [ ] Mobile responsive
- [ ] LCP < 2.5s on 4G" \
  "kind:feature,tier:P0,package:web,epic:web-routes" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(web): /r/[name] Contract Risk UI" \
  "## Motivation
Per-upgrade verdict surface for proxy upgrades (SAFE / REVIEW / ALERT).

## Acceptance criteria
- [ ] \`apps/web/app/r/[name]/page.tsx\` — Server Component
- [ ] Verdict card (color-coded)
- [ ] Implementation comparison (before/after)
- [ ] Sourcify evidence drawer
- [ ] Signature status badge" \
  "kind:feature,tier:P1,package:web,epic:web-routes" \
  "M3: First paid pilot (Aug 2026)"

create_issue \
  "feat(web): /api/cert/request-issue endpoint" \
  "## Motivation
Customer initiates cert request. Returns request_id + price + receiving address.

## Acceptance criteria
- [ ] POST /api/cert/request-issue accepts { ensName, tier, customerWallet }
- [ ] Returns { requestId, priceUsd, priceUsdc, priceEth (locked), receivingAddress, expiresAt }
- [ ] DB row created in cert_requests
- [ ] Idempotency via UUID
- [ ] Rate limited per customer wallet
- [ ] Tests" \
  "kind:feature,tier:P0,package:web,epic:web-routes" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(web): /api/cert/[id]/status endpoint" \
  "## Motivation
Customer polls for Sealed-tier async cert issuance status.

## Acceptance criteria
- [ ] GET /api/cert/[id]/status returns { state: 'pending'|'fetching'|'running'|'publishing'|'ready'|'refused', stepDetails, certUid? }
- [ ] State transitions logged to audit log
- [ ] Tests" \
  "kind:feature,tier:P0,package:web,epic:web-routes" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(web): /api/bench/[name] free public score endpoint" \
  "## Motivation
Free public score lookup for any ENS name — no cert issued, just score + breakdown.

## Acceptance criteria
- [ ] GET /api/bench/[name] returns { subject, score, tier, breakdown, evidenceBundleHash, computedAt }
- [ ] Rate-limited per IP
- [ ] Cached aggressively
- [ ] OpenAPI documented" \
  "kind:feature,tier:P0,package:web,epic:web-routes" \
  "M2: Anchored-tier v1 (Jul 2026)"

create_issue \
  "feat(web): /api/webhooks/payment forwarder event sink" \
  "## Motivation
VeralPaymentForwarder events delivered via webhook (or polling fallback) to trigger cert issuance.

## Acceptance criteria
- [ ] POST /api/webhooks/payment receives PaymentReceived events
- [ ] Signature verification (Alchemy webhook signing)
- [ ] Match requestId → trigger cert issuance via @veral/core
- [ ] Idempotency
- [ ] Replay protection" \
  "kind:feature,tier:P0,package:web,epic:web-routes" \
  "M2: Anchored-tier v1 (Jul 2026)"

# ═══════════════════════════════════════════════════════════
# EPIC: docs (M2-M3)
# ═══════════════════════════════════════════════════════════

create_issue \
  "feat(docs): OpenAPI spec + Mintlify docs site at docs.veral.tech" \
  "## Motivation
B2B customers need API reference + integration guides.

## Acceptance criteria
- [ ] OpenAPI 3.1 spec covers all /api/* endpoints
- [ ] Auto-generated docs site at docs.veral.tech (Mintlify or Docusaurus)
- [ ] Integration guides for common patterns
- [ ] Postman collection exported" \
  "kind:docs,tier:P1,epic:docs" \
  "M3: First paid pilot (Aug 2026)"

create_issue \
  "feat(docs): write remaining ADRs (005-014)" \
  "## Motivation
Architecture audit identified missing ADRs. Each documents a locked decision.

## Acceptance criteria
- [ ] ADR-005 subject-resolution.md
- [ ] ADR-006 eas-schema.md (Q11)
- [ ] ADR-007 cert-state-machine.md (Q3, Q10)
- [ ] ADR-008 operator-key-custody.md (Q5, Q12)
- [ ] ADR-009 privacy-gdpr.md (Q10)
- [ ] ADR-010 payment-forwarder-contract.md (Q2, Q9)
- [ ] ADR-011 state-management.md (Q6 — update of ADR-000)
- [ ] ADR-012 source-rate-limits.md
- [ ] ADR-013 agent-failure-policy.md (Q4)
- [ ] ADR-014 llm-cost-model.md" \
  "kind:docs,tier:P0,epic:docs" \
  "M1: Brand launch (Jun 2026)"

echo ""
echo "=== Issue count after seed ==="
gh issue list --repo "$REPO" --limit 100 --state open | wc -l
