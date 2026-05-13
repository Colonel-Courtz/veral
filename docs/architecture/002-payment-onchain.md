# ADR-002: Payment Infrastructure — On-Chain Native (USDC / ETH)

**Status:** Locked 2026-05-13 by Daniel.
**Depends on:** ADR-000, ADR-001.

---

## Decision

All certificate purchases are settled **on-chain in USDC or ETH**. No Stripe, no card processing, no off-chain fiat rails in v1.0.

---

## Rationale

1. **Crypto-native customer profile.** Veral's customers (DAO voters, protocol teams, fund analysts, venture launch reviewers) already operate on-chain. Card payment would be friction.
2. **Audit-friendly.** Every payment leaves an immutable on-chain receipt. No reconciliation between Stripe ledger and our DB.
3. **No payment processor risk.** Stripe / payment processors may freeze accounts on crypto-business profile.
4. **Zero fees beyond gas.** No 2.9% + $0.30 per transaction. Customer pays gas, Veral receives gross.
5. **Foreign-incorporation friendly.** Reduces regulated-payment-services exposure when establishing legal entity abroad.

---

## Payment flow

```
1. User clicks "Issue [Tier] certificate" in UI
   ↓
2. UI displays:
   - Tier price in USDC (primary) and ETH (fallback)
   - Veral receiving address (per chain)
   - Idempotency key (request UUID) to embed in tx data
   ↓
3. User signs ERC-20 transferWithCallback OR plain transfer + memo
   ↓
4. UI submits tx hash to /api/cert/payment-confirm
   ↓
5. Backend verifies tx:
   - Tx is mined and finalized (12 block confirmations on L2, 3 on mainnet)
   - Tx recipient matches Veral receiving address
   - Tx amount matches tier price (within tolerance for price slippage)
   - Tx data field contains idempotency key
   - Tx sender matches customer wallet (signed-in or signature-verified)
   ↓
6. Backend marks cert issuance as PAID in Turso
   ↓
7. Issuance pipeline triggered (evidence → score → tier check → EAS publish)
   ↓
8. EAS attestation UID returned to customer
```

---

## Receiving addresses

| Chain | Address | Notes |
|---|---|---|
| Ethereum mainnet | TBD (operator wallet for v1.0) | Multisig in v1.5 per ADR-000 |
| Base | TBD | Same operator |
| Arbitrum | TBD | Same operator |
| Optimism | TBD | Same operator |
| Polygon | TBD | Same operator |

**v1.0 simplification:** Single operator wallet receives on all chains. Customer chooses chain at checkout; we accept payment from any supported L2 + mainnet.

**Migration to multisig (v1.5):** Receiving address becomes Safe multisig; payments flow through Safe; signers approve weekly batched withdrawals to operating account.

---

## Token support

| Token | Required? | Notes |
|---|---|---|
| USDC | Yes — primary | Native on every supported chain |
| ETH | Yes — fallback | Customer prefers gas-token simplicity |
| USDT | No | Regulatory complexity; revisit post-revenue |
| Other ERC-20 | No | Out of scope |

Price is denominated in USD (e.g. Public = $1) but **paid in token-equivalent at time of issuance**. Exchange rate from CoinGecko spot at request time, with 1% tolerance to handle minor slippage between display and tx submission.

---

## Idempotency model

Every issuance request generates a UUID v4 (`requestId`). The flow:

1. **Client requests** `/api/cert/request-issue` → backend returns `requestId` + price + receiving address.
2. **Client embeds** `requestId` in tx data field when sending USDC/ETH (e.g. as memo, or via a thin payment forwarder contract that emits the requestId in an event).
3. **Backend listens** for receiving-address transfers, matches against pending `requestId`s in Turso.
4. **Re-submissions** of the same `requestId` are idempotent — returns existing cert UID without re-charging.

**Edge case:** if customer sends payment but never submits the confirm endpoint, backend's event listener picks it up and triggers issuance autonomously. The `requestId`-in-tx-data is the binding mechanism.

---

## Payment forwarder contract (optional v1.5)

For better UX and stronger idempotency, deploy a thin `VeralPaymentForwarder.sol` contract per chain:

```solidity
contract VeralPaymentForwarder {
    address public immutable receiver;
    event PaymentReceived(
        address indexed payer,
        address indexed token,
        uint256 amount,
        bytes32 indexed requestId
    );
    function pay(address token, uint256 amount, bytes32 requestId) external;
    function payNative(bytes32 requestId) external payable;
}
```

- Forwards funds to `receiver` (operator wallet or multisig).
- Emits `PaymentReceived` with `requestId` for indexing.
- Backend listens to this event instead of generic ERC-20 transfers — cleaner, more reliable.

**v1.0 ship:** plain transfers with memo. **v1.5 upgrade:** add forwarder for production polish.

---

## Refund / dispute policy

- **No automatic refunds.** Certs are issued upon payment confirmation; payment is consideration for service rendered.
- **Manual refund procedure** documented in `docs/operations/refund-procedure.md` for edge cases (e.g. issuance failure on Veral side — should be near-zero given idempotency).
- **No chargebacks possible** on-chain (unlike Stripe). Reduces fraud risk for Veral.

---

## Tax / accounting

- **Revenue recognition:** at the moment of EAS attestation finalization (service delivered).
- **VAT / GST handling:** TBD post-incorporation. Likely no VAT applicable for B2B crypto transactions if foreign-incorporated correctly; consult legal advisor before mainnet launch.
- **On-chain accounting:** every payment is publicly verifiable via Etherscan. Veral's financial state is queryable on-chain by any investor or auditor.

---

## Implications for `packages/authority/issuance`

The issuance package must:

1. Accept `paymentReceipt` (on-chain tx hash + chain ID) as part of issuance request.
2. Call `attest.verifyPayment(receipt, tier, requestId)` before signing attestation.
3. Refuse issuance if payment verification fails.
4. Log every payment verification in audit trail.

`packages/attest/payment.ts` (new file):

```typescript
export async function verifyPayment(
  receipt: PaymentReceipt,
  tier: TierKey,
  requestId: string
): Promise<PaymentVerificationResult> {
  // 1. Fetch tx from RPC
  // 2. Confirm finality (12 blocks L2, 3 mainnet)
  // 3. Verify recipient = Veral address on that chain
  // 4. Verify token + amount matches tier price (with 1% tolerance)
  // 5. Verify tx data contains requestId
  // 6. Return verified status
}
```

---

## Anti-bloat enforcement

- **No Stripe imports anywhere.** Lint rule bans `import` of `stripe` package.
- **One payment verifier.** No "PaymentVerifierV2" wrappers. If verification logic changes, modify the existing verifier with a version bump.
- **No off-chain payment ledger in DB beyond audit log.** Source of truth is on-chain. Turso records the cert ↔ tx mapping for query convenience; not authoritative.
