# ADR-003: Revocation Policy — 12-Month Time-Bound Expiry

**Status:** Locked 2026-05-13 by Daniel.
**Depends on:** ADR-000, ADR-001, ADR-002.

---

## Decision

Every issued certificate expires **12 months after issuance** by default. Expiry is encoded in the EAS attestation payload (`validUntil` field). No on-chain revocation action required for expiry — clients verifying the cert reject any attestation where `now > validUntil`.

No operator-initiated revocation in v1.0. Operator-revoke capability deferred to v1.5 with explicit ADR.

---

## Rationale

1. **Evidence ages.** A subject's reputation 12 months ago is not the same as today. Sourcify status may have changed, GitHub may have been compromised, ENS records may have rotated. Fresh certs reflect fresh state.
2. **Recurring revenue.** Annual re-issuance creates predictable customer lifecycle and revenue stream.
3. **Simple audit semantics.** "Valid as of issuance date, expires 12 months later" is unambiguous. No "is it revoked?" lookups required by verifiers.
4. **Reduces operator power.** No revocation action means operator cannot retroactively invalidate certs after issuance — increases customer trust.
5. **EAS-native.** EAS schema supports `validUntil` natively; no custom indexing infrastructure needed.

---

## EAS schema field

```typescript
interface VeralCertAttestation {
  subjectEnsName: string;        // e.g. "alice.eth"
  subjectNamehash: bytes32;      // computed namehash for binding
  tier: 'Public' | 'Anchored' | 'Sealed';
  score: number;                 // 0-100
  scoreFormulaVersion: string;   // e.g. "v1.0"
  issuedAt: uint64;              // unix timestamp
  validUntil: uint64;            // issuedAt + 365 days
  evidenceBundleHash: bytes32;   // commit to the evidence used
  schemaVersion: string;         // EAS schema version, e.g. "veral-cert-v1"
  signer: address;               // operator wallet address
}
```

**Verification by third party:**

```typescript
function isCertValid(att: VeralCertAttestation, nowSec: number): boolean {
  return nowSec >= att.issuedAt && nowSec < att.validUntil;
}
```

No on-chain revocation status read needed. Pure stateless verification.

---

## Customer-facing expiry semantics

- **At issuance:** cert is valid for 365 days from `issuedAt`.
- **At 11 months:** UI shows "Your cert expires in 30 days. Renew now for continuity."
- **At 12 months:** cert transitions to `expired` state in Veral UI. Customers viewing the cert see "Expired N days ago. Issue a new one to reflect current state."
- **After expiry:** old cert remains permanently on-chain as historical record. New issuance creates a new EAS attestation (new UID). Both UIDs are queryable, but only the current one is `valid`.

---

## Renewal flow

1. Customer receives expiry warning email/notification at 11 months.
2. Customer clicks "Renew Veral cert."
3. System fetches fresh evidence (full re-fetch — score may have changed).
4. New score + new tier eligibility computed.
5. Customer pays for current tier (same or upgrade/downgrade based on new evidence).
6. New EAS attestation issued.
7. Old attestation is **not** revoked — it remains as a historical record. The new cert's `previousUID` field links back for audit-trail continuity.

---

## EAS attestation `revocable` flag

EAS supports `revocable: true | false` at schema registration time. For Veral cert schemas:

- **`revocable: false`** for v1.0. Certs are immutable. Expiry is the only "end-of-life" mechanism.
- **Migration path to `revocable: true`** in v1.5 if operator-revoke capability is added (e.g. for verified-fraud cases). Will require new schema UID — v1 and v2 schemas coexist.

---

## Edge cases

### Subject's ENS namehash changes

If the customer rotates ENS ownership (e.g. transfers `alice.eth` to a new address):

- Existing cert remains valid until expiry — it certified state at issuance time.
- Veral diff banner (UI feature) detects the rotation and surfaces "ENS owner rotated since cert issued."
- Customer can issue a new cert to reflect new state.

### Subject becomes compromised after issuance

If a subject is hacked / scammed after issuance:

- v1.0: cert remains valid until expiry. Veral has no revocation capability.
- Recourse for customers: re-issue cert (new score will reflect new evidence). Old cert remains as audit trail.
- v1.5 may add operator-revoke for documented fraud cases — requires new schema, new ADR, customer notification.

### Cert customer disputes their own score

- v1.0: no dispute mechanism beyond re-issuance. Customer pays for new cert if they believe score should be different (e.g. they fixed GitHub activity).
- Veral does not adjust scores manually — the formula is open source and deterministic.

---

## Implications for `packages/authority/revocation`

For v1.0, the `revocation/` directory contains:

```typescript
// packages/authority/src/revocation/expiry.ts
export const CERT_VALIDITY_DAYS = 365;
export const CERT_VALIDITY_SECONDS = CERT_VALIDITY_DAYS * 24 * 60 * 60;

export function computeValidUntil(issuedAt: number): number {
  return issuedAt + CERT_VALIDITY_SECONDS;
}

export function isExpired(validUntil: number, nowSec: number): boolean {
  return nowSec >= validUntil;
}
```

That's it. No revocation logic in v1.0. The directory exists to anchor v1.5+ expansion.

---

## Anti-bloat enforcement

- **No "RevocationManagerService" abstraction.** v1.0 has 2 functions and 2 constants. Adding a service class would be premature.
- **No on-chain revocation TX in v1.0.** Lint rule bans `eas.revoke()` calls from authority package until v1.5 ADR explicitly enables.
- **One expiry constant.** `CERT_VALIDITY_DAYS = 365` is defined once. No per-tier overrides in v1.0.
