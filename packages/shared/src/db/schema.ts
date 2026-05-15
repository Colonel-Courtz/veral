import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const TIER = ['Public', 'Anchored', 'Sealed'] as const;
export type Tier = (typeof TIER)[number];

export const REQUEST_STATE = [
  'REQUESTED',
  'PAID',
  'FETCHING',
  'RUNNING',
  'PUBLISHING',
  'ISSUED',
  'REFUSED',
  'ABANDONED',
] as const;
export type RequestState = (typeof REQUEST_STATE)[number];

export const certRequests = sqliteTable('cert_requests', {
  id: text('id').primaryKey(),
  subjectNamehash: text('subject_namehash').notNull(),
  subjectEnsName: text('subject_ens_name').notNull(),
  tier: text('tier', { enum: TIER }).notNull(),
  customerWallet: text('customer_wallet').notNull(),
  priceUsdCents: integer('price_usd_cents').notNull(),
  priceUsdcRaw: text('price_usdc_raw').notNull(),
  priceEthWei: text('price_eth_wei'),
  ethUsdRateAtRequest: text('eth_usd_rate_at_request'),
  receivingAddress: text('receiving_address').notNull(),
  state: text('state', { enum: REQUEST_STATE }).notNull().default('REQUESTED'),
  paymentChainId: integer('payment_chain_id'),
  paymentTxHash: text('payment_tx_hash'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  paidAt: integer('paid_at', { mode: 'timestamp' }),
  issuedAt: integer('issued_at', { mode: 'timestamp' }),
  certUid: text('cert_uid'),
  refusalReason: text('refusal_reason'),
});

export const certificates = sqliteTable('certificates', {
  uid: text('uid').primaryKey(),
  subjectNamehash: text('subject_namehash').notNull(),
  subjectEnsName: text('subject_ens_name').notNull(),
  tier: text('tier', { enum: TIER }).notNull(),
  score: integer('score').notNull(),
  scoreFormulaVersion: text('score_formula_version').notNull(),
  issuedAt: integer('issued_at', { mode: 'timestamp' }).notNull(),
  validUntil: integer('valid_until', { mode: 'timestamp' }).notNull(),
  evidenceBundleHash: text('evidence_bundle_hash').notNull(),
  aiProvenanceHash: text('ai_provenance_hash'),
  forensicHash: text('forensic_hash'),
  signer: text('signer').notNull(),
  previousUid: text('previous_uid'),
  schemaUid: text('schema_uid').notNull(),
  chainId: integer('chain_id').notNull(),
  agentsSucceeded: integer('agents_succeeded').notNull(),
  agentsTotal: integer('agents_total').notNull(),
  requestId: text('request_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const subjects = sqliteTable('subjects', {
  namehash: text('namehash').primaryKey(),
  ensName: text('ens_name').notNull(),
  primaryAddress: text('primary_address'),
  manifestHash: text('manifest_hash'),
  manifestSignerVerified: integer('manifest_signer_verified', { mode: 'boolean' })
    .notNull()
    .default(false),
  kind: text('kind', {
    enum: ['ai-agent', 'human-team', 'project', 'unknown'],
  }).notNull(),
  lastResolvedAt: integer('last_resolved_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const paymentRecords = sqliteTable('payment_records', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull(),
  txHash: text('tx_hash').notNull(),
  chainId: integer('chain_id').notNull(),
  payerAddress: text('payer_address').notNull(),
  tokenAddress: text('token_address').notNull(),
  amountRaw: text('amount_raw').notNull(),
  amountUsdCents: integer('amount_usd_cents').notNull(),
  blockNumber: integer('block_number').notNull(),
  blockTimestamp: integer('block_timestamp', { mode: 'timestamp' }).notNull(),
  verifiedAt: integer('verified_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const AUDIT_DECISION = [
  'request.created',
  'request.expired',
  'payment.verified',
  'payment.rejected',
  'eligibility.passed',
  'eligibility.refused',
  'manifest.verified',
  'manifest.rejected',
  'agents.threshold_passed',
  'agents.threshold_failed',
  'sanctions.checked',
  'sanctions.matched',
  'cert.issued',
  'cert.refused',
  'cert.refund_initiated',
] as const;
export type AuditDecision = (typeof AUDIT_DECISION)[number];

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  decision: text('decision', { enum: AUDIT_DECISION }).notNull(),
  subjectNamehash: text('subject_namehash'),
  requestId: text('request_id'),
  tier: text('tier', { enum: TIER }),
  actor: text('actor').notNull(),
  reason: text('reason').notNull(),
  inputHash: text('input_hash'),
  metadata: text('metadata'),
  loggedAt: integer('logged_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export type CertRequest = typeof certRequests.$inferSelect;
export type NewCertRequest = typeof certRequests.$inferInsert;
export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;
export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;
export type PaymentRecord = typeof paymentRecords.$inferSelect;
export type NewPaymentRecord = typeof paymentRecords.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
