# ADR-001: Certificate Tier Methodology

**Status:** Locked 2026-05-13 by Daniel.
**Depends on:** ADR-000.

---

## Decision

Three certificate tiers represent **progressive depth of verification methodology**, not progressive count of data sources. Each tier adds a new analytical layer on top of the previous tier's evidence.

### Tier 1 — Public (Deterministic Aggregation)

- **Methodology:** Pure data aggregation from on-chain and ENS-native sources. Zero AI, zero inference, zero interpretation.
- **Output:** Score computed from raw signals via the locked open-source formula.
- **Use case:** Indexing, monitoring, basic verification, scam-flag.
- **Why no AI:** Deterministic. Re-derivable from public APIs. No black-box. Auditor can recompute the score by hand.
- **Sources used:** All sources contribute raw signals. No semantic interpretation.

### Tier 2 — Anchored (AI-Augmented Analysis)

- **Methodology:** Tier 1 + AI agent reads source content and surfaces additional signals.
- **Examples of AI-derived signals:**
  - Reads GitHub repository code and surfaces "is this fork of a known scam template?"
  - Reads Sourcify-verified Solidity source and surfaces "does this contract implement OpenZeppelin Ownable correctly?"
  - Reads ENS records and surfaces "does the bio claim contracts that match the on-chain primary address?"
  - Reads Farcaster casts and surfaces "has this account discussed scam patterns?"
- **Output:** Tier 1 score + AI-augmented signal annotations + AI confidence per annotation.
- **Use case:** DAO governance vote evidence, protocol transparency page, fund triage.
- **Why AI:** Surfaces semantic signals that deterministic aggregation misses. AI agent operates on top of evidence already fetched in Tier 1 — same data pipeline, deeper analysis.
- **AI provenance:** Every AI-derived signal includes the model version, prompt hash, and source content hash. Auditor can re-run.

### Tier 3 — Sealed (Forensic Audit)

- **Methodology:** Tier 2 + corporate forensic + financial forensic + cross-jurisdictional regulatory check.
- **Examples of Tier-3-only checks:**
  - Beneficial ownership verification via OpenCorporates, Companies House (UK), Sirene (FR), SEC EDGAR (US)
  - Treasury flow analysis via Etherscan + Chainalysis-style heuristics
  - OFAC sanctions list cross-check
  - VAT / tax registration verification (EU + UK)
  - Audit firm cross-attestation (if the subject claims an audit, verify the audit firm's signature)
  - Legal entity reputation (litigation history, regulatory action)
- **Output:** Tier 2 + forensic findings report + signed audit attestation.
- **Use case:** Institutional due diligence, fund of funds onboarding, regulated entity verification, M&A target screening.
- **Why forensic:** Some customers need audit-grade due diligence comparable to PwC / KPMG / Big Four reports — at a fraction of the cost and with cryptographic provenance.
- **Human-in-the-loop:** TBD (see Outstanding Decisions below).

---

## Tier comparison matrix

| Dimension | Public | Anchored | Sealed |
|---|---|---|---|
| Price | $0.50–$2 | $5–$20 | $50–$500 |
| AI used | No | Yes (reading source content) | Yes + forensic automation |
| External regulatory APIs | No | No | Yes |
| Human review | No | No | TBD |
| Latency target | <5 seconds | <30 seconds | <5 minutes (or async) |
| Confidence reporting | Score + breakdown | + AI confidence per signal | + forensic findings + provenance |
| Re-derivable by user | Yes (open formula) | Partial (AI provenance) | Partial (audit trail) |
| EAS attestation type | Standard schema v1 | Extended schema v1 with AI annotations | Forensic schema v1 with findings document URI |

---

## Source set per tier (revised from ADR-000)

All tiers operate on the **same 20 source data set**. The difference is what is **done** with that data:

| Source category | Tier 1 use | Tier 2 use | Tier 3 use |
|---|---|---|---|
| Sourcify | Verification status, ABI fingerprint | + AI reads Solidity source for pattern detection | + audit firm cross-attestation if claimed |
| GitHub | Commit count, PR count, repo age | + AI reads README, scans for scam patterns, code quality inference | + maintainer identity verification, employer cross-check |
| Etherscan | Verified-contract status | + AI parses contract labels for known-scam matches | + treasury flow analysis |
| Ethereum mainnet | Tx history, nonce | (passive) | + Chainalysis-style flow heuristics |
| L2 deployments | Cross-chain footprint | (passive) | + cross-jurisdictional regulatory check per chain |
| ENS-internal | Records, subnames, expiry | + AI evaluates bio claims against on-chain reality | + beneficial ownership match |
| EAS read | Existing attestations | + AI reads attestation payloads for relevance | + cross-issuer verification |
| DefiLlama | TVL, protocol metrics | (passive) | + fund-flow audit |
| EigenLayer | AVS participation | (passive) | + operator-set due diligence |
| The Graph | Subgraph health | (passive) | (passive) |
| Token registries | Listing status | (passive) | + listing-fee audit trail |
| Gitcoin Passport | Stamps list | + AI scores stamp combination | + identity provider cross-check |
| POAP | Event participation | + AI maps events to known communities | (passive) |
| Farcaster | Account activity | + AI reads casts for scam-signal language | + identity cross-verification |
| Lens | Social graph | + AI evaluates graph quality | (passive) |
| Code4rena | Audit history | + AI summarizes audit severity findings | + audit firm verification |
| Immunefi | Bug bounty participation | + AI summarizes severity tiers handled | + payout history audit |
| Tenderly | Monitoring presence | (passive) | + alert configuration audit |
| Safe multisig | Signer composition | + AI checks signer identity patterns | + KYC cross-check on signers |
| NPM/PyPI | Package publishing | + AI scans dependency for known-bad packages | (passive) |

**Tier 3 additional sources (not in standard 20):**

- **OpenCorporates** — global corporate registry
- **Companies House (UK)** — UK entity verification
- **Sirene (FR)** — French entity verification
- **SEC EDGAR (US)** — US public company filings
- **OFAC SDN list** — sanctions screening
- **WHOIS** — domain registration cross-check
- **Chainalysis-style heuristics** — internal flow analysis (no Chainalysis API dependency — public-only)

---

## Implications for `packages/authority` structure

```
packages/authority/src/
├── tier-rules/
│   ├── public-tier.ts        # Deterministic eligibility: needs N base sources non-zero
│   ├── anchored-tier.ts      # Tier 1 eligibility + AI-augmentation feasibility check
│   └── sealed-tier.ts        # Tier 2 eligibility + forensic-source coverage check
├── analysis/
│   ├── deterministic/        # Tier 1 logic — pure score formula
│   ├── ai-augmented/         # Tier 2 logic — calls AI Gateway, parses responses
│   │   ├── github-analyzer.ts
│   │   ├── sourcify-analyzer.ts
│   │   ├── ens-bio-analyzer.ts
│   │   └── ...
│   └── forensic/             # Tier 3 logic — orchestrates external regulatory APIs
│       ├── opencorporates.ts
│       ├── companies-house.ts
│       ├── sec-edgar.ts
│       ├── ofac.ts
│       └── ...
├── policy/                   # Validation thresholds (min sources, min score, required signals)
├── issuance/                 # Cert generation per tier
├── revocation/               # 12-mes expiry (see ADR-003)
├── audit-trail/              # Decision log
└── schema/                   # EAS schema versioning + migration
```

---

## Anti-bloat enforcement

- **No AI in Tier 1.** Lint rule: `tier-rules/public-tier.ts` and `analysis/deterministic/` cannot import from `ai-augmented/` or call AI Gateway.
- **AI provenance mandatory in Tier 2.** Every AI-derived signal must include model + prompt hash + content hash. Type-system enforced via `AiAugmentedSignal` interface.
- **Forensic API isolation in Tier 3.** Each external regulatory API lives in its own file with mockable interface. Tests run against fixtures, not live APIs.

---

## Outstanding decisions

| Decision | Status |
|---|---|
| AI provider for Tier 2 (Vercel AI Gateway vs direct) | TBD — see ADR-004 (planned) |
| Tier 3 automation level (fully automated vs human-in-the-loop) | TBD — see ADR-005 (planned) |
| Additional Tier 3 forensic sources beyond initial 7 | Open — extend as customers request |
