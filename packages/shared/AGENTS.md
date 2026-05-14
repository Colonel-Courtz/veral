# @veral/shared — agent guidance

## Purpose

Foundational types, interfaces, and error classes shared across every other Veral package. No runtime logic, no I/O.

## Boundary

- This package is **zero-dependency on other Veral packages**. It sits at the bottom of the dependency graph.
- External dependencies: `zod` (runtime schema validation). Nothing else.
- Adding any other runtime dependency requires an ADR.

## Allowed contents

- Type definitions (`interface`, `type`, `enum`)
- Zod schemas for cross-package validation
- Error classes extending `VeralError`
- Pure constants (e.g. `TIER_CONFIG`, `TRUST_DISCOUNT_UNVERIFIED`)
- Type guards (`isTierKey`, etc)

## Forbidden

- Network calls (fetch, RPC, HTTP)
- File system access
- Database access
- LLM calls
- Async operations beyond pure type-level
- Importing from any `@veral/*` package
- React / Next.js code

## Directory structure

```
src/
├── index.ts              # Barrel export
├── tiers/
│   └── index.ts          # TierKey, TierConfig, TIER_CONFIG
├── agents/
│   └── index.ts          # SourceAgent, AgentResult, AgentProvenance, BackendDescriptor
├── subject/
│   └── types.ts          # SubjectManifest, DeclaredSources, SubjectKind
└── errors.ts             # VeralError + subclasses
```

## Conventions

- All types `readonly` by default
- All arrays `ReadonlyArray<T>` in public types
- Discriminated unions over class hierarchies
- Zod schemas live alongside the types they validate
- Re-exports from `index.ts` are alphabetical

## Adding a new type

1. Place in the appropriate subdirectory (`tiers`, `agents`, `subject`) or create new one with single responsibility
2. Add corresponding Zod schema if the type crosses a boundary (DB row, API response, agent finding)
3. Re-export from `src/index.ts`
4. If breaking change: bump major version when consumed by other packages

## Test expectations

- Coverage target: 70%+ (focus on type guards and Zod schemas; pure types need no runtime tests)
- Tests live in `src/**/__tests__/`
