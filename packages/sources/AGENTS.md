# @veral/sources — agent guidance

## Purpose

Twenty (eventually) scoped specialist agents, each domain-bound to exactly one public evidence source. Each agent fetches raw data and returns a structured `AgentResult<TFindings>`.

## Architectural rules (binding — see ADR-004)

1. **Scoped domain.** Each agent operates on exactly one source. GitHub agent never sees Sourcify data. Sourcify agent never sees Farcaster posts.
2. **Algorithmic orchestration.** The orchestrator (in `@veral/authority/orchestrator`) is pure code. No LLM-as-judge. No LLM-as-router.
3. **Structured findings.** Every agent returns Zod-validated structured data. No free-form text.
4. **Provenance per finding.** Every result includes agent ID, version, backend (API / CLI / RPC / LLM), input hash, prompt hash (if LLM).
5. **Versioned agents.** Every agent has `version: SemVer`. Breaking changes bump major.

## Directory structure

```
src/
├── agents/
│   ├── extractors/                # Tier 1 — deterministic, no AI
│   │   ├── sourcify/
│   │   │   ├── agent.ts
│   │   │   ├── schema.ts          # Zod schema for findings
│   │   │   ├── client.ts          # API client
│   │   │   └── __tests__/
│   │   ├── github/
│   │   ├── ethereum/
│   │   ├── ens/
│   │   └── ...
│   ├── ai-analysis/               # Tier 2 — LLM-augmented per domain
│   │   ├── github-readme/
│   │   ├── github-code/
│   │   ├── sourcify-source/
│   │   ├── ens-bio/
│   │   └── ...
│   └── forensic/                  # Tier 3 only
│       ├── opencorporates/
│       ├── companies-house/
│       ├── sec-edgar/
│       ├── ofac/
│       └── ...
└── index.ts                       # Barrel export of all agent registrations
```

## Adding a new agent

1. Create directory `agents/<category>/<source>/`
2. Define `schema.ts` with Zod-validated findings shape
3. Define `client.ts` with API / CLI / LLM backend integration
4. Define `agent.ts` implementing `SourceAgent<TFindings>` from `@veral/shared`
5. Register in package's `index.ts`
6. Add fixture-based tests
7. Document rate-limit budget and TTL in the agent's JSDoc

## Backend types

```typescript
type BackendDescriptor =
  | { kind: 'rest-api'; baseUrl: string; version: string }
  | { kind: 'cli'; tool: string; version: string }
  | { kind: 'rpc'; chain: string; provider: string }
  | { kind: 'llm'; provider: string; model: string };
```

LLM backends use Vercel AI Gateway (`AI_GATEWAY_API_KEY`) by default. Direct provider SDK use requires ADR justification.

## Forbidden

- Cross-agent imports (`github-extract` cannot import from `sourcify-extract`)
- Shared mutable state across agents
- Free-form text findings
- Skipping provenance fields
- Hardcoded API keys (use env vars)
- Logging full source data (PII risk — log only hashes)

## Rate limits + caching

Each agent declares its rate-limit budget and recommended cache TTL. The orchestrator and `@upstash/redis` cache enforce these.

Default cache TTLs (override per-agent if needed):

- Sourcify: 24h
- GitHub: 1h
- On-chain RPC: 5min
- ENS records: 5min
- EAS attestations: 1h
- Regulator APIs (forensic): 7 days

## Test expectations

- Coverage target: 60%+ (high external-dependency surface, partial mock acceptable)
- Mock all backends in unit tests (MSW for HTTP, direct stubs for RPC)
- Integration tests against fixtures (real recorded responses), not live APIs in CI
