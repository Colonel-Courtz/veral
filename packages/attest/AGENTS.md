# @veral/attest — agent guidance

## Purpose

EAS attestation publishing primitives, EIP-712 typed-data signing, payment verification against on-chain receipts, EAS schema registration scripts.

## Boundary

- Imports allowed: `@veral/shared`, EAS SDK, viem, zod
- Imports forbidden: `@veral/sources`, `@veral/authority` (top-down)
- This package is a low-level signing + publishing primitive. Higher-level orchestration lives in `@veral/authority/issuance`.

## Directory structure

```
src/
├── eip712/
│   ├── typed-data.ts             # Canonical EIP-712 typed-data schema
│   ├── sign.ts                   # Operator signing function
│   └── verify.ts                 # Public verification function
├── eas/
│   ├── publish.ts                # Submit attestation to EAS contract
│   ├── read.ts                   # Read attestations from EAS
│   ├── schema-register.ts        # One-time schema registration script
│   └── uids.ts                   # Per-network schema UID constants
├── payment/
│   ├── verify-tx.ts              # Verify USDC/ETH payment tx against request
│   ├── price-oracle.ts           # CoinGecko USD/ETH lock at request time
│   └── forwarder-events.ts       # VeralPaymentForwarder event listener
└── index.ts
```

## Architectural rules (binding — see ADR-002, ADR-003, ADR-008)

1. **Single signer per network.** v1.0 reads `REPORT_SIGNER_PRIVATE_KEY` from environment.
2. **Full-payload EIP-712 signing.** Sign the entire payload, not a digest. Customers verify against full canonical struct.
3. **EAS schema version embedded in every attestation.** Cert payload includes `schemaVersion: 'veral.cert.v1'`.
4. **previousUID for renewals.** New attestation links to old via `previousUID` field — never re-attest same UID.
5. **No off-chain payment fallback.** Payment is USDC or ETH on-chain only (per ADR-002).

## EAS schema (v1.0 — LOCKED)

```
bytes32 subjectNamehash,
string subjectEnsName,
uint8 tier,                // 0=Public, 1=Anchored, 2=Sealed
uint16 score,              // 0-100
string scoreFormulaVersion,
uint64 issuedAt,
uint64 validUntil,
bytes32 evidenceBundleHash,
bytes32 aiProvenanceHash,  // nullable (zero bytes32 if not used)
bytes32 forensicHash,      // nullable
address signer,
bytes32 previousUID        // nullable
```

UIDs per network:

- Mainnet: registered via `eas/schema-register.ts` (UID stored in `eas/uids.ts`)
- Sepolia: same script, different env

## Forbidden

- Sign without `eligibility-gate` approval from `@veral/authority`
- Reveal private key in logs or errors
- Bypass payment verification for testing (use isolated test fixtures)
- Mix mainnet and Sepolia signers in one runtime
- Modify schema definition without ADR (breaks all existing attestations)

## Test expectations

- Coverage target: 70%+
- Integration tests against Sepolia testnet (CI-gated)
- Mock EAS SDK in unit tests
- Property-based tests for EIP-712 canonicalization

## Operator key custody (v1.0)

- Private key in env var `REPORT_SIGNER_PRIVATE_KEY` only
- Quarterly rotation documented in `docs/operations/key-rotation.md`
- Migration to AWS KMS / multisig at v1.5 (first paid enterprise customer trigger)

## Payment verification flow

1. Customer submits cert request → backend creates `requestId` + price quote (USDC fixed, ETH locked at CoinGecko rate)
2. Customer calls `VeralPaymentForwarder.pay(token, amount, requestId)` on chain
3. Forwarder emits `PaymentReceived(payer, token, amount, requestId)`
4. Backend event listener picks up event, calls `verify-tx.ts`
5. On verification success, `issuance` proceeds with signing
6. Idempotency: same `requestId` returns existing cert UID without re-signing
