# @veral/authority — agent guidance

## Purpose

The certificate authority. Decides what tier a subject qualifies for, applies threshold policy, issues attestation payloads, manages cert lifecycle (expiry, renewal links), and logs every decision to the audit trail.

This package is the **single source of truth** for "who signs what, why, and under what conditions" — the answer foreign-investor due-diligence asks first.

## Boundary

- Imports allowed: `@veral/shared`, `@veral/score`, `@veral/sources`, `@veral/attest`
- Imports forbidden: `apps/web` (top-down dependency), no HTTP frameworks, no React

## Directory structure

```
src/
├── tier-rules/
│   ├── public-tier.ts            # Public eligibility (deterministic, no AI)
│   ├── anchored-tier.ts          # Anchored eligibility (AI feasibility check)
│   ├── sealed-tier.ts            # Sealed eligibility (forensic source coverage check)
│   └── index.ts
├── policy/
│   ├── thresholds.ts             # Required agent success rate per tier (90% uniform)
│   ├── manifest-verification.ts  # Tier-specific manifest sig handling
│   ├── ttl.ts                    # Request TTL per tier (15min/30min/24h)
│   └── index.ts
├── analysis/
│   ├── orchestrator.ts           # Algorithmic parallel agent runner
│   ├── registry.ts               # Single agent registry (lint-enforced singleton)
│   └── synthesis/                # Cross-source rules (Sealed tier only)
│       ├── beneficial-ownership.ts
│       ├── timeline-correlation.ts
│       ├── sanctions-cross-check.ts
│       └── engine.ts
├── issuance/
│   ├── payload-builder.ts        # Constructs EAS attestation payload per tier
│   ├── eligibility-gate.ts       # Final yes/no before signing
│   └── index.ts
├── revocation/
│   └── expiry.ts                 # 12-month time-bound expiry (CERT_VALIDITY_SECONDS)
├── audit-trail/
│   ├── log.ts                    # Append-only decision log
│   └── types.ts
└── schema/
    ├── eas-schemas.ts            # EAS schema UIDs per network (registered separately)
    └── attestation-payload.ts    # ABI-encoded payload shape
```

## Architectural rules (binding — see ADR-001, ADR-004, ADR-008)

1. **No LLM in the orchestrator.** Orchestrator is pure deterministic code. LLM calls live inside individual agents only.
2. **No cross-source data sharing between agents.** Agents are isolated. Cross-source correlation happens in `synthesis/` (pure code, no LLM).
3. **One agent registry.** Singleton in `analysis/registry.ts`. Adding a parallel registry is a CI failure.
4. **Single signer per cert (v1.0).** Hot key in env var; migration to multisig is a v1.5 ADR.
5. **Append-only audit log.** Every decision (eligibility result, issuance, refusal) writes one row. No updates, no deletes.

## Tier methodology mapping

| Tier | Methodology | Agents used |
|---|---|---|
| Public | Deterministic aggregation, no AI | `agents/extractors/*` only |
| Anchored | + AI-augmented analysis | extractors + `agents/ai-analysis/*` |
| Sealed | + Forensic audit (corporate, financial, regulatory) | extractors + ai-analysis + `agents/forensic/*` + `synthesis/*` |

## Forbidden

- Bypassing `eligibility-gate` for any reason
- Issuing certs without writing to audit log
- Reading customer PII outside the wallet address (SIWE auth scope)
- Storing operator private key in code or DB (env var only)
- Modifying past audit log entries

## Test expectations

- Coverage target: 80%+ (this is the decision engine; high coverage is mandatory)
- All tier eligibility paths have unit tests
- Policy threshold edge cases tested (exactly at threshold, just below, just above)
- Synthesis rules tested with fixture findings
- Audit log assertions in integration tests

## Signing key access

Signing happens via `@veral/attest`. This package never directly accesses the operator private key. Calls `attest.sign()` which reads the key from environment.

## When asked to "add a new tier"

Do not add a fourth tier (Premium, Enterprise) without an ADR. The three-tier model is locked. Tier additions require:

1. New ADR proposing the tier + methodology
2. EAS schema migration plan (new schema version or extended fields)
3. Pricing decision
4. Migration plan for existing certs
