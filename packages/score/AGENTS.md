# @veral/score — agent guidance

## Purpose

Deterministic score computation. Takes an `EvidenceBundle`, returns a `ScoreResult`. Pure function. No side effects.

## Boundary

- Imports allowed: `@veral/shared` only
- Imports forbidden: anything else (no `sources`, no `authority`, no `attest`, no Node-specific APIs)
- No network calls
- No async (computation is synchronous, deterministic)

## Versioning

The score formula is **immutable per version**. Existing certs reference a specific `scoreFormulaVersion` (e.g. `v1.0`). Auditors must be able to re-derive any historical score byte-for-byte.

```
src/
├── versions/
│   ├── v1.0/
│   │   ├── weights.ts        # LOCKED 2026-05-13
│   │   ├── components.ts     # Pure compute functions per component
│   │   ├── engine.ts         # Aggregation pipeline
│   │   └── index.ts          # Public export for v1.0
│   └── v1.1/                 # FUTURE — when shipped, never modify weights.ts
└── index.ts                  # Exports computeForVersion(v)
```

## Rules for new versions

1. Never modify `weights.ts` of a shipped version. Existing certs depend on byte-identical replay.
2. New version = new directory `versions/v{X.Y}/`
3. New version's `weights.ts` may differ; document differences in a `CHANGES.md` per version directory
4. Bump major SemVer of `@veral/score` package when adding a new version (because consumers must choose explicitly)

## Forbidden

- Mutable globals
- Random number generation in compute paths (deterministic only)
- Floating-point operations without explicit tolerance (use integer arithmetic where possible)
- Reading environment variables (config flows in through function arguments)
- Logging in the hot path

## Test expectations

- Coverage target: 80%+ (this is the deterministic core; high coverage is mandatory)
- Property-based tests for arithmetic invariants (sum of weights = 1.0; score in [0, 100])
- Golden-file tests: fixed `EvidenceBundle` inputs → expected `ScoreResult` outputs (regression guard)
- Tests in `src/versions/v{X.Y}/__tests__/`

## When asked to "improve the score formula"

Do **not** modify v1.0. Open a new ADR proposing v1.1 with rationale, ship v1.1 in a new directory, default new certs to v1.1, leave existing certs on v1.0 forever.
