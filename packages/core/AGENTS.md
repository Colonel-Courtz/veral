# @veral/core — agent guidance

## Purpose

Subject resolution (ENS name → `SubjectManifest`) and the public orchestration entry points consumed by `apps/web` API routes. This package is the **gateway** between HTTP-level concerns and the analysis pipeline.

## Boundary

- Imports allowed: `@veral/shared`, `@veral/sources`, `@veral/score`, `@veral/authority`, `@veral/attest`, viem (for ENS resolution)
- Imports forbidden: `apps/web`, React, Next.js APIs (this is a runtime-agnostic library)

## Directory structure

```
src/
├── subject-resolver/
│   ├── resolve.ts               # ENS namehash → SubjectManifest
│   ├── manifest-parse.ts        # Parse veral.bench-manifest JSON text record
│   ├── manifest-verify.ts       # EIP-712 signature check against veral.owner
│   ├── public-read-fallback.ts  # Infer manifest when none published
│   └── __tests__/
├── orchestration/
│   ├── issue-cert.ts            # Public entry: request → eligibility → issuance
│   ├── recompute-score.ts       # Public entry: ENS name → ScoreResult (free)
│   └── status.ts                # Async cert request status query (Sealed tier)
└── index.ts
```

## Architectural rules

1. **No HTTP request/response handling here.** That's `apps/web` API routes. Core exposes typed functions; web exposes them over HTTP.
2. **Subject resolution always live.** Never serve cached subject data without a fresh ENS lookup (cache TTL applies to source data inside the pipeline, not subject identity).
3. **Public-read fallback is universal.** Any subject queryable on ENS gets at least a Public-tier score; only Anchored+ requires opt-in manifest.

## Forbidden

- Hardcoding subject test data
- Skipping manifest signature verification in non-Public tiers
- Returning partial results without explicit `status: 'partial'` flag
- Storing subject manifest content in DB (read live from ENS each time; cache only at source-data level)

## Test expectations

- Coverage target: 70%+
- Subject resolution paths: manifest valid, manifest invalid sig, no manifest (public-read), ENS expired
- Orchestration happy path + failure modes (agent failure threshold, payment unverified, eligibility refused)

## Sealed-tier async handling

Sealed-tier cert issuance can take 5-15 minutes. This package's `issue-cert.ts` returns immediately with a `requestId` for Sealed; the work happens in a Vercel Queue (or equivalent async worker). The API route polls `status.ts` until ready.

For Public + Anchored, issuance is synchronous (returns within 30s).

## When asked to "add a new entry point"

Public entry points (`issue-cert`, `recompute-score`, `status`) are stable surface. New entry points require:

1. ADR justifying necessity
2. Backward-compatible API
3. Test coverage from day one
