# ADR-000: Veral System Architecture Overview

**Status:** Locked 2026-05-13 by Daniel.
**Supersedes:** None (greenfield).
**Purpose:** Single source of truth for high-level system architecture. Every implementation decision must trace back to a locked design principle in this document or a subsequent ADR.

---

## 1. System purpose

Veral is the **Verification Authority Layer** for Ethereum. It takes any ENS-named subject, reads up to twenty public sources of evidence in parallel, computes a deterministic 0–100 reputation score with structural trust-discount on unverified claims, and — if requested and paid for — issues a tier-graded certificate as an EAS attestation bound to the subject's ENS namehash.

The free path (score lookup + breakdown panel + open-source formula) is a public good. The paid path (certificate issuance) is the commercial layer.

---

## 2. Locked architectural principles

### Principle 1 — Progressive certificate tiers

Three certificate tiers represent **strict supersets** of evidence sources. The relationship is hierarchical, not parallel:

```
Sealed (50–500 USD)
  ├── Anchored (5–20 USD)
  │   ├── Public (0.50–2 USD)
  │   │   └── 4–6 base sources
  │   └── + 6 mid-tier sources = 12–15
  └── + 5 sealed-tier sources + ZK proof + cross-sign = 18–20
```

**Consequence for code:**
- One source pipeline. `packages/sources/` produces a single `EvidenceBundle` per subject. Tier eligibility is a *filter* on top of that bundle, not a separate fetch.
- A user paying for Public who later wants Anchored does **not** trigger re-fetch — Anchored evidence is computed from the same data.
- Tier eligibility is deterministic given evidence — no probabilistic upgrade path.

### Principle 2 — Decision engine in `packages/authority`

A dedicated package owns **all logic** about what certificate a subject is eligible for, what data is required, what threshold rules apply, and what signing flow runs. Nothing about certificates lives in `apps/web` beyond UI rendering, and nothing lives in `packages/score` beyond pure score computation.

```
packages/authority/src/
  tier-rules/        Eligibility logic: given EvidenceBundle, which tiers qualify?
  policy/            Validation thresholds (min sources, min score, required signals)
  issuance/          Cert generation: builds EAS attestation payload for tier
  revocation/        Lifecycle management (revoke, expire, refresh)
  audit-trail/       Decision log: every cert-related decision is logged with reason
  schema/            EAS schema versioning + migration
```

**Consequence for code:**
- `packages/score/` produces ScoreResult, nothing more.
- `packages/sources/` produces EvidenceBundle, nothing more.
- `packages/authority/` consumes ScoreResult + EvidenceBundle, decides tier eligibility, generates issuance payload.
- `apps/web/` orchestrates HTTP, payment, render. Does not embed business logic.

**Foreign-investor framing:** Authority package is a self-contained, auditable, testable unit. An external auditor reviews exactly one package to understand "who signs what, why, and under what conditions."

### Principle 3 — Single operator signer for v1.0 with documented roadmap

One EIP-712 signer wallet, controlled by Veral team, signs all v1.0 certificates. Key custody, rotation procedure, and incident response are documented in `docs/operations/signer-custody.md` (to be written).

**Migration roadmap:**

| Stage | When | Authority |
|---|---|---|
| **v1.0** | Q3-Q4 2026 | Single operator wallet (hot or HSM-backed) |
| **v1.5** | First paid customer + ENS SPP funding | Safe multisig (2-of-3 or 3-of-5) |
| **v2.0** | Post-revenue, regulatory clarity | ENS DAO-governed or on-chain governed authority |

**Consequence for code:**
- `packages/authority/issuance/` reads signer from environment at runtime, allowing migration to multisig with minimal refactor.
- Cert format includes signer address + signing scheme version, allowing future multisig certs to coexist with v1 single-sig certs.

### Principle 4 — Stateless API with DB transactions for v1.0

No workflow engine in v1.0. Every API request is stateless. Persistent state (cert records, payment records, audit log) lives in Turso (libSQL) with idempotent transaction semantics.

**Migration roadmap:**
- v1.0: stateless API + Turso transactions
- v1.5+: introduce Vercel Workflow DevKit when issuance flow exceeds 8 steps or async dependencies require durable resume

**Consequence for code:**
- Every cert issuance request includes idempotency key (request ID).
- Turso schema enforces uniqueness on (subject, tier, issuanceRequestId).
- Retries are safe — re-running issuance with same idempotency key returns existing cert without re-signing.
- No long-running background jobs in v1.0. Synchronous request/response.

---

## 3. Package boundaries

```
veral/
├── apps/
│   └── web/                  Next.js 16 App Router — HTTP surface, payment, render
├── packages/
│   ├── core/                 Subject resolution, orchestration entry points
│   ├── sources/              Twenty data-source adapters (one per source)
│   ├── score/                Pure score computation — input EvidenceBundle, output ScoreResult
│   ├── authority/            Certificate authority — tier eligibility, issuance, revocation
│   ├── attest/               EAS attestation publishing primitives (chain-level)
│   └── shared/               Shared types + utilities (DTOs, error types, validators)
├── contracts/                Foundry — Solidity contracts (mocks, fixtures, future on-chain extensions)
├── scripts/                  Operational scripts (deploy, ENS provision, key rotation)
└── docs/                     Architecture decisions, runbooks, postmortems
```

**Dependency direction (enforced via TS imports + lint rule):**

```
apps/web → core → sources, score, authority, attest, shared
authority → score, sources, attest, shared
score → shared (only)
sources → shared (only)
attest → shared (only)
```

`apps/web` is at the top of the dependency graph. `shared` is at the bottom. No package depends on `apps/web`. No cycles permitted (enforced via `madge` or `dependency-cruiser` in CI).

---

## 4. Data flow per certificate request

```
HTTP request /api/cert/issue
  ↓
apps/web/api/cert/issue/route.ts
  ↓ idempotency check (Turso)
  ↓
core.resolveSubject(ensName) → SubjectManifest
  ↓
sources.fetchAll(SubjectManifest) → EvidenceBundle  [20 parallel fetches]
  ↓
score.compute(EvidenceBundle) → ScoreResult
  ↓
authority.checkTierEligibility(EvidenceBundle, ScoreResult, requestedTier) → TierVerdict
  ↓ (if eligible)
authority.verifyPayment(paymentReceipt, tier) → PaymentVerdict
  ↓ (if paid)
authority.issuance.buildPayload(SubjectManifest, ScoreResult, tier) → AttestationPayload
  ↓
attest.publish(AttestationPayload, signer) → EasAttestationUID
  ↓
Turso.write(certRecord)
  ↓
audit-trail.log(decisionRecord)
  ↓
HTTP response → certificate UID + EAS URL
```

**Each arrow is a typed function call.** No implicit state. No global singletons. Every step is independently testable.

---

## 5. Anti-bloat enforcement (architectural)

The following architectural rules prevent the AI-bloat patterns that contaminated the prior Siren codebase:

1. **Strict dependency graph.** Cycles are CI failures. `apps/web` cannot import from `apps/web`. `score` cannot import from `sources`.

2. **Single registry pattern.** One source registry in `packages/sources/`. One tier-rule registry in `packages/authority/tier-rules/`. CI fails if a second registry pattern is introduced anywhere.

3. **No parallel abstractions.** If a feature needs to integrate with an existing system, the existing system is modified. No "unified wrapper that produces the same shape." Code review enforced.

4. **No reference-tag comments.** Lint rule (custom ESLint plugin) bans comments matching `/(US|GATE|EPIC|TICKET|ISSUE)-\d+/`. Comments explain WHY, not which ticket.

5. **Runtime data never in public/.** `.gitignore` already blocks `apps/web/public/cache/`, `public/manifests/`, `public/reports/`. CI verifies these paths are not created.

6. **One docs source of truth per concept.** `README.md` for project surface, `CLAUDE.md` for AI agents, `docs/architecture/` for decisions, `docs/operations/` for runbooks. No SCOPE.md, EPIC_*.md, BRAINSTORM.md proliferation.

7. **Architecture changes require ADR.** Any addition or modification of package boundaries, dependency direction, or principle in this document requires a new ADR in `docs/architecture/`. PR template enforces this.

---

## 6. Audit-readiness checklist

For foreign-investor / foreign-incorporation / external-audit presentation, the architecture must satisfy:

| Requirement | How Veral satisfies it |
|---|---|
| Single accountable signer | One operator wallet, address publicly disclosed in ENS records |
| Reproducible computation | Deterministic score formula, open-source, re-derivable from public APIs |
| Audit trail | Every cert decision logged with timestamp, reason, evidence hash |
| Schema versioning | EAS schema UID embedded in every attestation, migration path documented |
| Idempotent operations | Same request → same response, retries safe, no double-charge risk |
| Revocation procedure | (TBD — see ADR-006) |
| Payment provenance | (TBD — see ADR-007) |
| Incident response | Documented in `docs/operations/incident-response.md` |
| Key rotation | Documented in `docs/operations/signer-custody.md` |

---

## 7. Subsequent ADRs (planned)

| ADR | Topic | Status |
|---|---|---|
| ADR-001 | Source-to-tier progressive assignment | TBD — needs Daniel input on which sources land where |
| ADR-002 | Payment infrastructure (Stripe / on-chain / hybrid) | TBD — needs Daniel input |
| ADR-003 | Revocation policy (time-bound / manual / on-chain) | TBD — needs Daniel input |
| ADR-004 | EAS schema design (fields, versioning, schema UID) | Depends on ADR-001..003 |
| ADR-005 | Database schema (Turso tables, indexes, retention) | Depends on ADR-002, ADR-003 |
| ADR-006 | Score formula carry-over from Siren | Port `score/weights.ts` unchanged for v1.0 P0 |
| ADR-007 | Operator key custody + rotation | Operational doc |
| ADR-008 | Rate limiting + abuse protection | Operational |
| ADR-009 | Monitoring + observability | Operational |
| ADR-010 | CI/CD pipeline + branch protection | Engineering ops |

---

## 8. Outstanding decisions blocking implementation

Before any code (beyond skeleton scaffold) can be written, the following must be locked. These are the only remaining critical unknowns:

1. **Which 6 sources are Public-tier base? Which 6 are Anchored-tier extension? Which 6+ are Sealed-tier extension?** Daniel-input required (ADR-001).

2. **Payment infrastructure** — Stripe (card / off-chain), on-chain native (ETH / USDC), or hybrid? Daniel-input required (ADR-002).

3. **Revocation policy** — are certs revocable? Time-bound? Manual operator action? Daniel-input required (ADR-003).

Everything else can be derived from these three answers + Daniel's prior decisions.
