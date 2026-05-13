# Veral ENS SPP Deck — Fix Prompt v1.0

**Target audience:** Claude designer agent (or any AI/human deck editor).
**Date:** 2026-05-13.
**Input:** "Veral — ENS Service Provider Program, Term 1.pdf" (14 slides, identified as DOC 001 / 014 through DOC 014 / 014).

---

## ROLE

You are a senior deck editor responsible for correcting factual, architectural, and presentational errors in a foreign-investor-grade pitch deck for Veral (Verification Authority Layer for Ethereum), targeted at ENS DAO Service Provider Program Term 1 submission.

Your task is to apply the precise corrections listed below. Preserve all original visual design choices unless explicitly instructed otherwise.

---

## PRESERVE (do not change)

The following design elements are locked. Do not modify them:

- **Wordmark:** "Veral" with italic "al" suffix (mixed roman + italic serif)
- **Logo:** V monogram inside a Roman temple silhouette (institutional architecture metaphor)
- **Color palette:** slate `#2A3142` primary + warm gold `#C9A24E` accent + bone white `#F5F1E8` + parchment `#EDE4D3`
- **Typography:** serif display (Recoleta or equivalent) + mono labels + clean sans body
- **Layout grid:** existing 14-document numbering system (DOC 001 / 014 through DOC 014 / 014), to be renumbered to 016 after additions
- **Section header format:** "§ N.0 SECTION_NAME"
- **Footer format:** running header with VERAL + section label + DOC NNN / 016
- **Brand voice:** calm institutional authority, no marketing hype, no emoji (except 🥇 medals on Traction slide for direct evidence)

---

## LOCKED ARCHITECTURAL DECISIONS (override deck content where conflicting)

These decisions are locked in ADR documents at `docs/architecture/` and must be reflected accurately in the deck:

1. **Primary domain is `veral.tech`** (purchased 2026-05-13). The `veral.xyz` reference throughout the original deck is incorrect.

2. **Certificate tier methodology** is **depth of analysis**, not source count:
   - **Public** = deterministic data aggregation, no AI, no inference
   - **Anchored** = AI-augmented analysis using scoped specialist agents
   - **Sealed** = forensic audit including financial, corporate, and regulatory verification

3. **Scoped specialist agent architecture** is Veral's proprietary architectural IP:
   - Each AI agent operates on exactly one data source domain
   - The orchestrator is pure deterministic code (no LLM-as-judge, no LLM-as-router)
   - Every finding carries provenance (agent ID, version, backend, input hash, prompt hash)
   - This architecture is the strongest differentiator vs generic LangChain/AutoGen agentic systems

4. **Operator signer authority** progresses through three stages:
   - v1.0 (Term 1): single operator wallet
   - v1.5: Safe multisig (2-of-3 or 3-of-5)
   - v2.0: ENS DAO-governed or on-chain governed authority

5. **Payment infrastructure**: on-chain USDC / ETH only. No Stripe, no off-chain fiat rails in v1.0.

6. **Certificate validity**: time-bound expiry, 12 months from issuance. No on-chain revocation in v1.0.

7. **Tokenless**: Veral has no token. No tokenomics. Revenue from service, not speculation. This is a core principle.

---

## CORRECTIONS — slide by slide

### Slide 1 (DOC 001 / Cover)

**Change:** `DOMAIN veral.xyz — launching soon` → `DOMAIN veral.tech`

No other changes.

---

### Slide 2 (DOC 002 / Problem)

**Change:** Sentence in right column reading *"A reader who wants to verify a claim has to walk five sites, in five formats..."* → *"A reader who wants to verify a claim has to walk eight sites, in eight formats..."*

The original number conflicted with the 8 source-category tags shown below.

---

### Slide 3 (DOC 003 / Solution — Twenty public sources)

**Change footer legend:**
- `×1.0 — verified on-chain primitive · 11 sources` → `×1.0 — verified on-chain primitive · 10 sources`
- `×0.6 — claimed off-chain signal · 9 sources` → `×0.6 — claimed off-chain signal · 10 sources`

Reason: actual count from the visible list is 10/10, not 11/9.

---

### Slide 4 (DOC 004 / Live Product)

**Three URL changes:**

1. `veral.xyz/b/vitalik.eth` → `veral.tech/b/vitalik.eth`
2. `veral.xyz/r/letadlo.eth` → `veral.tech/r/letadlo.eth`
3. `veral.xyz/api/bench/siren-agent.eth` → `veral.tech/api/bench/siren-agent.eth`

**Subtitle note change:**

`upgrade-siren.vercel.app. veral.xyz launching soon — mock URLs in this slide show the planned domain.` → `upgrade-siren.vercel.app. veral.tech launching soon — mock URLs in this slide show the planned domain.`

**Add v1.0-preview disclaimer:**

Above the Vitalik example card add a small label: `V1.0 PREVIEW · 18/20 sources reflects target state post-roadmap`

This prevents misreading the example as current capability.

**JSON example adjustment:** reduce `"sources_verified": 14` to `"sources_verified": 8` to be consistent with Q3 target (12/20 sources online by end of Q3 in roadmap).

---

### Slide 5 (DOC 005 / Traction)

**Add proof-link annotations under the two medal cards:**

- Under Umia card: add small mono label `↳ devfolio.co/projects/[veral-or-siren-submission-id]`
- Under ENS card: add small mono label `↳ ETHPrague 2026 official results — link to be inserted`

Reason: foreign-investor-grade due diligence requires verifiable evidence of claimed achievements. Reviewer needs link to confirm.

Keep the 🥇 emoji medals — direct evidence exception.

---

### Slide 6 (DOC 006 / Why ENS)

**Update ENS text record namespace references:**

Replace the two record callouts at the bottom:

- `upgrade-siren:upgrade_manifest` — Per-contract version maps. Live-resolves every request.

  → `veral.upgrade-manifest` — Per-contract version maps. Live-resolves every request. (Legacy `upgrade-siren:*` namespace preserved for backward compatibility through Term 1.)

- `agent-bench:bench_manifest` — Multi-source declarations bound to namehash via full-payload EIP-712.

  → `veral.bench-manifest` — Multi-source declarations bound to namehash via full-payload EIP-712. (Legacy `agent-bench:*` namespace preserved for backward compatibility through Term 1.)

**Code snippet update in Step 03:**

- `schema = veral.score.v1` — keep as-is, already correct.

---

### Slide 7 (DOC 007 / Certificate Tiers) — MAJOR REWRITE

This slide's framing is fundamentally outdated. Rewrite using methodology-first language.

**New headline:** `Free verdict. Paid certification.` (unchanged)

**New subheading replacing "SOURCE-COUNT IS THE VISIBLE DIFFERENTIATOR":**

`METHODOLOGY DEPTH IS THE DIFFERENTIATOR · SAME 20 SOURCES, GROWING ANALYSIS.`

**Three tier cards — full content replacement:**

#### Card 1: Public ($0.50 – $2)
- Header label: `DETERMINISTIC AGGREGATION · NO AI`
- Body: *On-chain and ENS-native evidence aggregated via the open-source formula. Re-derivable by anyone, byte-for-byte.*
- Bullets:
  - Pure data aggregation, no inference
  - Re-derivable from public APIs
  - EAS attestation, schema `veral.score.v1`
  - 12-month validity
- Use line: `USE · INDEXING, MONITORING, BASIC VERIFICATION`

#### Card 2: Anchored ($5 – $20)
- Header label: `AI-AUGMENTED ANALYSIS · SCOPED SPECIALIST AGENTS`
- Body: *Each domain has a dedicated AI agent — GitHub agent reads code, Sourcify agent parses Solidity, ENS agent verifies bio claims. Every finding carries provenance.*
- Bullets:
  - Scoped agents — one source domain per agent
  - Algorithmic orchestrator — pure code, no LLM routing
  - Provenance per signal (model + prompt hash + input hash)
  - Owner-signed manifest required
- Use line: `USE · DAO GOVERNANCE, PROTOCOL TRANSPARENCY`

#### Card 3: Sealed ($50 – $500)
- Header label: `FORENSIC AUDIT · CORPORATE + FINANCIAL + REGULATORY`
- Body: *Beneficial ownership via OpenCorporates / Companies House / SEC EDGAR. OFAC sanctions screening. Treasury flow analysis. Audit-grade due diligence at a fraction of Big-Four cost.*
- Bullets:
  - Anchored + corporate registry verification
  - Financial flow analysis
  - OFAC sanctions cross-check
  - Tier S unlock with verified GitHub cross-sign
- Use line: `USE · INSTITUTIONAL DUE-DILIGENCE, AUDIT-GRADE`

**Footer line:** `Free forever — score lookup, breakdown panel, public API (rate-limited), open-source formula.` (unchanged)

---

### NEW SLIDE 8 (insert between current DOC 007 and DOC 008) — Scoped Agent Architecture

This is a new slide showcasing Veral's proprietary architectural IP. Position as Section § 6.5 or renumber subsequent sections.

**Layout:** Two-column or diagram-dominant.

**Header:** `§ 6.5 ARCHITECTURE`
**Title:** `Scoped specialist agents. Algorithmic orchestrator.`
**Subtitle:** `*Veral's proprietary verification IP.*`

**Diagram (visual):**

```
                  ┌──────────────────────────┐
                  │  Algorithmic Orchestrator│
                  │      (pure code)         │
                  └────┬─────┬─────┬─────────┘
            ┌──────────┘     │     └──────────┐
            ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │ GitHub      │  │ Sourcify    │  │ ENS Bio     │
   │ Agent       │  │ Agent       │  │ Agent       │
   │ ⊕ Claude    │  │ ⊕ Claude    │  │ ⊕ GPT-4     │
   └─────────────┘  └─────────────┘  └─────────────┘
   one source      one source      one source
   per agent       per agent       per agent
```

**Three pillars below the diagram:**

1. **Scoped domain.** GitHub agent never sees Sourcify data. Sourcify agent never sees Farcaster posts. Each agent operates on exactly one source. Cross-source hallucinations are architecturally impossible.

2. **Algorithmic orchestration.** The orchestrator is pure deterministic code. It reads the tier request, looks up applicable agents, runs them in parallel, aggregates structured findings. No LLM-as-judge. No LLM-as-router.

3. **Provenance per signal.** Every finding includes the agent ID, version, backend (API / CLI / LLM model), input data hash, and prompt hash. Auditor can reproduce every finding byte-for-byte.

**Footer line:** `Foreign-investor-grade auditability. Reproducible reasoning. Architectural defense against hallucination.`

---

### Slide 9 (was DOC 008 / Public-goods alignment)

**Add one bullet to the Public good (free layer) column:**

- `Tokenless by principle — no Veral token, no speculation, no governance distraction`

Position as the new first bullet of that column.

---

### Slide 10 (was DOC 009 / Roadmap)

**Subtitle fix:** Change `Q3-Q4 2026` → `Q2-Q4 2026` (since timeline starts in June which is Q2).

OR alternatively shift M1 from `Jun 2026` to `Jul 2026` and keep `Q3-Q4 2026`. Designer to choose based on layout fit; the timing claim must be internally consistent.

If shifting M1 to July: also shift M2-M6 forward by one month (Aug, Sep, Oct, Nov, Dec) and update KPI quarter mapping on next slide.

---

### Slide 11 (was DOC 010 / KPI)

**Quarter labels** must match Slide 10's resolution above.

If Slide 10 uses `Q2-Q4 2026`: change KPI labels to `Q3 MID · M2-M4` and `Q4 END · M5-M6` (or similar accurate split).

If Slide 10 shifts M1 to July: labels remain `Q3 TARGET · M1-M3` and `Q4 TARGET · M4-M6` since M1-M3 = Jul-Sep = Q3 and M4-M6 = Oct-Dec = Q4.

Internal consistency is the requirement.

---

### Slide 12 (was DOC 011 / Team)

**Role differentiation:**

- **Davyd Kurbanov** — change role from `CO-FOUNDER · MARKETING & ANALYTICS` to `CO-FOUNDER · GROWTH & PARTNERSHIPS`. Update bio to focus on sponsor relationships, conference presence, ecosystem partnerships, content distribution.

- **Kyryl Yefremov** — change role from `CO-FOUNDER · MARKETING & ANALYTICS` to `CO-FOUNDER · DATA & OPERATIONS`. Update bio to focus on KPI instrumentation, monthly reporting, internal analytics, operational metrics.

Two co-founders with identical role label is a foreign-investor red flag. Differentiation is required.

---

### Slide 13 (was DOC 012 / Budget)

**Reconcile team-budget transparency.**

**Option A (preferred):** Add a small explanatory line above or below the budget table:

`Co-founders Davyd, Kyryl, and Artem participate as equity-only contributors during Term 1. Salary structure for full co-founder compensation introduced in Term 2 contingent on KPI achievement and revenue ramp.`

**Option B:** Restructure the 50% engineering line:

- `50% Full-time engineering — 1 senior dev hire + Daniel founder salary · primary headcount — $150,000`

Designer to verify with Daniel which option reflects reality. Default to Option A.

---

### Slide 14 (was DOC 013 / Compounding)

**Item v bullet update:**

`Other ENS-anchored projects can fork the schema. Veral is the first instance, not the only one. Standardization is the goal.`

→ `Other ENS-anchored projects can fork the schema. Veral is the first instance, not the only one. Bench manifest schema proposed as ENSIP candidate for v1.5 standardization.`

Adds concrete commitment to standardization, not just aspirational language.

---

### NEW SLIDE 15 (insert between Compounding and Closing) — Operational Transparency

**Header:** `§ 12.5 TRANSPARENCY`
**Title:** `Operational transparency.`
**Subtitle:** `*How Veral signs, charges, and expires.*`

**Four sub-sections:**

#### SIGNER AUTHORITY
- v1.0 (Term 1): single operator wallet, address disclosed in ENS records and on veral.tech/operations
- v1.5: migration to Safe multisig (2-of-3 or 3-of-5), signers publicly identified
- v2.0: ENS DAO-governed or on-chain governed authority

#### PAYMENT
- On-chain USDC or ETH on mainnet + supported L2s (Base, Arbitrum, Optimism, Polygon)
- No Stripe, no off-chain fiat rails
- Receiving address publicly disclosed per chain
- Every payment leaves an immutable on-chain receipt

#### CERTIFICATE VALIDITY
- 12 months from issuance — encoded in EAS attestation `validUntil` field
- No on-chain revocation in v1.0 (certs are immutable historical records)
- Renewal re-fetches fresh evidence, issues new attestation

#### TAX & ACCOUNTING
- Revenue recognized at EAS finalization (service delivered)
- Public on-chain accounting — Veral's financial state queryable by any auditor
- Foreign-incorporation friendly — minimal regulated-payment-services exposure

**Footer:** `Every operational choice on the record. No black-box authority.`

---

### Slide 16 (was DOC 014 / Closing)

**Change in contact block:**

- `WEB veral.xyz — launching soon` → `WEB veral.tech`

No other changes.

---

## DOCUMENT NUMBERING UPDATE

Original deck: 14 slides numbered DOC 001 / 014 through DOC 014 / 014.

After fix (2 new slides added): 16 slides numbered DOC 001 / 016 through DOC 016 / 016.

Update **every** footer running header to reflect new total.

Update **every** section number reference in body copy.

---

## BRAND VOICE REINFORCEMENTS (apply throughout)

- No marketing hype: ban words `revolutionary`, `disrupting`, `paradigm-shift`, `unleash`, `unlock`, `next-generation`, `AI-powered` (without specifics), `Web3 future`
- Use: `deterministic`, `verifiable`, `re-derivable`, `sourced`, `signed`, `attested`, `anchored`, `structurally`, `transparent`, `reproducible`
- Statements over claims: *"The score is. We do not predict."* not *"Our AI predicts trust."*
- No emoji except 🥇 medals on Traction slide (direct evidence)
- No exclamation marks
- Italic only for verb emphasis in section headlines (continuing existing pattern)

---

## OUTPUT REQUIREMENTS

- **Format primary:** editable Pitch.com link
- **Format secondary:** PDF export, fonts embedded
- **Format brand source:** Figma file with all logo variants + color tokens
- **Slide count:** 16 (was 14, +2 new)
- **Page numbering:** updated throughout (DOC NNN / 016)
- **Internal cross-references:** section numbers updated to new layout
- **Typography + palette:** unchanged from original

---

## ACCEPTANCE CRITERIA

Before submission, verify:

- [ ] Zero `veral.xyz` references remain anywhere
- [ ] Tier methodology framing matches ADR-001 (deterministic / AI-augmented / forensic)
- [ ] New Scoped Agent Architecture slide present and visually clear
- [ ] New Operational Transparency slide present
- [ ] Trust factor count footer: 10 verified + 10 unverified (not 11/9)
- [ ] Quarter labels internally consistent (Q2-Q4 or M1=Jul shifted)
- [ ] Davyd and Kyryl have differentiated roles
- [ ] Budget slide reconciles compensation for all 4 founders
- [ ] Tokenless principle stated in Public-goods slide
- [ ] ETHPrague proof-links present on Traction slide
- [ ] ENS namespace updated to `veral.*` with backward-compat note
- [ ] All 16 footers show correct total numbering

---

## SUMMARY OF CHANGES

| Category | Count | Severity |
|---|---|---|
| URL corrections (`veral.xyz` → `veral.tech`) | 5 | Critical |
| Tier methodology rewrite (Slide 7) | 1 (slide-level) | Critical |
| New slides added | 2 (Scoped Agent, Operational Transparency) | Significant |
| Factual fixes (trust factor count, quarters, "five sites") | 3 | Significant |
| Team-budget reconciliation | 2 (role diff + budget transparency) | Significant |
| Brand voice / language reinforcement | Multiple | Minor (throughout) |
| Namespace migration callout | 1 (Slide 6) | Minor |
| ETHPrague proof-link annotations | 1 (Slide 5) | Minor |

---

## END OF FIX PROMPT
