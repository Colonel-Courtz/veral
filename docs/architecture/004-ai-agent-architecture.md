# ADR-004: AI Agent Architecture — Scoped Specialists + Algorithmic Orchestrator

**Status:** Locked 2026-05-13 by Daniel.
**Depends on:** ADR-000, ADR-001.

---

## Decision

Veral's analysis layer uses **scoped specialist agents** orchestrated **algorithmically** (deterministically). This is the foundational architectural pattern for the entire `packages/authority/analysis/` directory.

This pattern is **Veral's proprietary architectural IP** for trustworthy AI verification:

- Each agent operates on **exactly one data source domain**.
- Each agent uses any backend it needs — public API, CLI tool, or LLM provider.
- Agents return **structured findings** matching a versioned Zod schema.
- The **orchestrator is pure code** — no LLM-as-judge, no LLM-as-router, no LLM has visibility across agent boundaries.
- Every finding carries provenance: which agent, which version, which backend, which prompt hash (if AI), which input data hash.

---

## Why this pattern

### Problem with typical agentic systems

Standard agentic frameworks (LangChain, AutoGen, generic GPT/Claude tool-use) give a single LLM access to multiple tools and let it plan. This produces:

- **Halucinated cross-source claims** ("GitHub commits suggest the Sourcify-verified contract is suspicious" — without seeing actual Sourcify data the LLM imagines).
- **Untraceable reasoning chains** — auditor cannot reproduce or verify the LLM's tool-use decisions.
- **Provenance loss** — was this finding from GitHub data, ENS data, or LLM imagination?
- **Non-determinism** — same input may produce different orchestration paths.

For a **certification authority**, none of these are acceptable.

### Veral's solution: scoped + algorithmic

1. **Agents are domain-scoped.** GitHub agent never sees ENS data. Sourcify agent never sees Farcaster posts. An agent's input is the subject manifest + its domain-specific raw data.
2. **Orchestrator is algorithmic.** Pure code reads tier request, looks up which agents apply, calls them in parallel, aggregates structured outputs. No LLM in the orchestration layer.
3. **Findings are structured.** Every agent returns data matching a Zod schema. No free-form text. Auditor sees typed, structured findings.
4. **Provenance is mandatory.** Every finding includes:
   - Agent ID + version
   - Backend used (API endpoint / CLI tool / LLM model)
   - Input data hash (so the same input is reproducible)
   - Prompt hash (if AI was used)
   - Timestamp + run UUID

---

## The Agent interface

```typescript
// packages/shared/src/agents/types.ts

export interface SourceAgent<TFindings extends StructuredFindings> {
  readonly id: AgentId;
  readonly version: SemVer;
  readonly domain: SourceDomain;          // e.g. 'github', 'sourcify', 'ens', 'opencorporates'
  readonly tierApplicability: TierKey[];  // ['Public'] | ['Public','Anchored'] | etc.
  readonly schema: ZodSchema<TFindings>;  // output schema

  run(input: AgentInput): Promise<AgentResult<TFindings>>;
}

export interface AgentInput {
  readonly subject: SubjectManifest;
  readonly runUuid: string;               // for correlation
}

export interface AgentResult<TFindings> {
  readonly agentId: AgentId;
  readonly agentVersion: SemVer;
  readonly runUuid: string;
  readonly runStartedAt: number;
  readonly runFinishedAt: number;
  readonly status: 'ok' | 'partial' | 'error';
  readonly findings: TFindings | null;    // null on error
  readonly provenance: AgentProvenance;
}

export interface AgentProvenance {
  readonly backend: BackendDescriptor;    // 'github-rest-api' | 'claude-3.5-sonnet' | 'gh-cli-2.39' | etc.
  readonly inputHash: string;             // hash of source data fetched
  readonly promptHash?: string;           // hash of LLM prompt template (if AI)
  readonly modelResponseHash?: string;    // hash of LLM raw response (if AI)
  readonly errorMessage?: string;         // populated on status='error'
}
```

---

## Agent categories

### Category A — Deterministic Extractor Agents

No AI. Pure API / CLI / on-chain reads. Used by all tiers.

```
packages/authority/src/analysis/agents/extractors/
├── github-extract.ts         # gh API → raw signals (commit count, repo age, etc.)
├── sourcify-extract.ts       # Sourcify API → verification status, ABI hash
├── ens-extract.ts            # viem + ENSjs → records, subnames, expiry
├── ethereum-extract.ts       # viem RPC → nonce, first tx, contracts deployed
├── l2-extract.ts             # multi-chain viem → cross-chain footprint
├── eas-extract.ts            # EAS SDK → existing attestations
├── etherscan-extract.ts      # Etherscan API → verified-contract labels
├── defillama-extract.ts      # DefiLlama API → TVL, protocol metrics
├── eigenlayer-extract.ts     # EigenLayer API → AVS participation
├── thegraph-extract.ts       # Graph node → subgraph health
├── tokenlist-extract.ts      # Uniswap default list, 1inch tokenlist
├── passport-extract.ts       # Gitcoin Passport API → stamps
├── poap-extract.ts           # POAP API → event participation
├── farcaster-extract.ts      # Farcaster Hub → FID activity
├── lens-extract.ts           # Lens API → social graph
├── code4rena-extract.ts      # C4 API or scraper → audit history
├── immunefi-extract.ts       # Immunefi API → bug bounty participation
├── tenderly-extract.ts       # Tenderly API → monitoring presence
├── safe-extract.ts           # Safe API → signer composition
└── npm-extract.ts            # NPM registry → package publishing
```

### Category B — AI Analysis Agents (Tier 2+)

LLM reads source content fetched by a deterministic extractor. Produces semantic findings.

```
packages/authority/src/analysis/agents/ai-analysis/
├── github-readme-analyze.ts    # Reads README, scores quality, flags scam patterns
├── github-code-analyze.ts      # Reads code samples, identifies frameworks/patterns
├── sourcify-source-analyze.ts  # Reads Solidity source, identifies OZ patterns, custom risk
├── ens-bio-analyze.ts          # Reads ENS bio claims, cross-checks against on-chain reality
├── farcaster-cast-analyze.ts   # Reads recent casts, flags scam-signal language
└── ...
```

Each AI analysis agent:
- Takes raw data from the corresponding extractor (not the source API directly).
- Uses Vercel AI Gateway with provider/model specified per-agent (Claude for code, GPT for general text, etc. — agent decides, orchestrator doesn't).
- Returns structured findings (not free-form text).
- Includes prompt hash + model version in provenance.

### Category C — Forensic Agents (Tier 3 only)

Specialized agents for regulatory / corporate / financial data.

```
packages/authority/src/analysis/agents/forensic/
├── opencorporates-agent.ts     # Global corporate registry lookup
├── companies-house-agent.ts    # UK entity verification
├── sirene-agent.ts             # French entity verification
├── sec-edgar-agent.ts          # US public company filings
├── ofac-agent.ts               # Sanctions list cross-check
├── whois-agent.ts              # Domain registration cross-check
└── treasury-flow-agent.ts      # On-chain flow heuristics
```

Most forensic agents are **deterministic** (API lookups, no AI needed). AI may be added for findings synthesis but the data fetch itself is deterministic.

---

## The Orchestrator

```typescript
// packages/authority/src/analysis/orchestrator.ts

import { agentRegistry } from './registry.js';
import type { AgentResult, SubjectManifest, TierKey } from '@veral/shared';

interface OrchestrationInput {
  readonly subject: SubjectManifest;
  readonly requestedTier: TierKey;
  readonly runUuid: string;
}

interface OrchestrationOutput {
  readonly subject: SubjectManifest;
  readonly tier: TierKey;
  readonly results: ReadonlyArray<AgentResult<unknown>>;
  readonly totalDurationMs: number;
}

export async function orchestrate(input: OrchestrationInput): Promise<OrchestrationOutput> {
  const agents = agentRegistry.getAgentsForTier(input.requestedTier);

  const startTime = Date.now();
  const results = await Promise.all(
    agents.map(agent => agent.run({
      subject: input.subject,
      runUuid: input.runUuid,
    }))
  );
  const totalDurationMs = Date.now() - startTime;

  return {
    subject: input.subject,
    tier: input.requestedTier,
    results,
    totalDurationMs,
  };
}
```

**Properties:**
- Deterministic given inputs.
- Pure parallel execution.
- No LLM in routing or aggregation.
- Per-agent timeout, retry, and failure isolation handled inside `agent.run()` — orchestrator just collects results.

---

## Agent registry

```typescript
// packages/authority/src/analysis/registry.ts

import type { SourceAgent, TierKey, AgentId } from '@veral/shared';

class AgentRegistry {
  private agents = new Map<AgentId, SourceAgent<unknown>>();

  register(agent: SourceAgent<unknown>): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent already registered: ${agent.id}`);
    }
    this.agents.set(agent.id, agent);
  }

  getAgentsForTier(tier: TierKey): SourceAgent<unknown>[] {
    return Array.from(this.agents.values()).filter(a =>
      a.tierApplicability.includes(tier)
    );
  }
}

export const agentRegistry = new AgentRegistry();
```

**Single registry. No parallel registry pattern. Lint-enforced.**

---

## Backend support — APIs, CLIs, LLMs

Daniel's directive: *"budeme používať zmes agentov s rôznym API alebo CLI."*

Veral supports three agent backend types via a `BackendDescriptor` enum:

```typescript
type BackendDescriptor =
  | { kind: 'rest-api'; baseUrl: string; version: string }
  | { kind: 'cli'; tool: string; version: string }           // e.g. 'gh@2.39'
  | { kind: 'rpc'; chain: string; provider: string }         // e.g. 'mainnet@alchemy'
  | { kind: 'llm'; provider: string; model: string };        // e.g. 'vercel-ai-gateway/claude-3.5-sonnet'
```

Examples:

- `github-extract` agent → `kind: 'rest-api'`, `baseUrl: 'api.github.com'`, `version: 'v3'`
- `forge-deploy-history` agent → `kind: 'cli'`, `tool: 'forge'`, `version: '1.0.0'`
- `ens-extract` agent → `kind: 'rpc'`, `chain: 'mainnet'`, `provider: 'alchemy'`
- `github-readme-analyze` agent → `kind: 'llm'`, `provider: 'vercel-ai-gateway'`, `model: 'claude-3.5-sonnet'`

The orchestrator does not care which backend an agent uses. The agent itself encapsulates the backend choice.

---

## LLM provider routing — Vercel AI Gateway default

For LLM-backed agents, default to **Vercel AI Gateway** unless the agent author has explicit reason to bypass:

- Single API key (in environment as `AI_GATEWAY_API_KEY`).
- Provider-agnostic model strings (`provider/model` syntax).
- Built-in observability per call.
- Cost passthrough — no Vercel markup.
- Zero data retention (Vercel-side configurable).

Direct provider SDKs (e.g. `@anthropic-ai/sdk`) are permitted but require ADR justification (typically: experimental features, fine-grained provider control).

**Lint rule:** Any agent using direct provider SDK must include a comment block citing the specific feature requirement.

---

## Multi-agent mix per cert tier

Tier eligibility maps to agent activation:

| Tier | Active agent categories |
|---|---|
| **Public** | Extractors only |
| **Anchored** | Extractors + AI Analysis (subset — code/text-heavy sources) |
| **Sealed** | Extractors + AI Analysis (full set) + Forensic |

The orchestrator filters by `tierApplicability`. Agent metadata declares which tiers it serves.

---

## Anti-bloat enforcement (architectural)

- **No agent imports another agent.** Agents are isolated. Cross-agent dependencies happen at the orchestrator level (deterministic code) — never inside an agent.
- **No LLM call outside an agent.** Every LLM call lives inside an agent's `run()` method. UI never calls LLM directly. API routes never call LLM directly.
- **One registry.** `agentRegistry` is a singleton, registered in alphabetical order in `agents/index.ts`.
- **No "AnalysisEngine" / "AnalysisService" wrapper.** The orchestrator is a pure function. No class hierarchy.
- **Versioned agents.** Every agent has `version: SemVer`. Breaking changes bump major. Audit trail records exact agent version per finding.
- **Structured findings only.** Agents that return free-form text fail review. Zod schema enforced at compile + runtime.

---

## Implications for ENS SPP pitch + foreign-investor presentation

This pattern is a **selling point** for:

1. **Auditors:** every signal traces to one agent, one backend, one input hash. Reproducible.
2. **Regulators:** AI usage is bounded — no LLM has cross-domain visibility. Explainable.
3. **Customers:** they can request the agent provenance log alongside any cert.
4. **Investors:** architecture is defensible IP. Other reputation primitives use generic LLM tool-use → halucinations → trust loss. Veral's scoped pattern is unique.

In deck slide content: *"Veral uses scoped specialist agents. Each agent sees one source, returns one structured finding. The orchestrator is pure code. No LLM hallucinates across data boundaries. Foreign-investor-grade verifiability."*

---

## Outstanding decisions

| Decision | Status |
|---|---|
| Vercel AI Gateway specific model defaults per agent type | Picked at agent author time, documented per agent |
| Tier 3 human-in-the-loop step | TBD — see ADR-005 |
| Agent retry/timeout policies | TBD — operational ADR |
| Agent observability (per-call metrics) | TBD — operational ADR |
