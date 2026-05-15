CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`decision` text NOT NULL,
	`subject_namehash` text,
	`request_id` text,
	`tier` text,
	`actor` text NOT NULL,
	`reason` text NOT NULL,
	`input_hash` text,
	`metadata` text,
	`logged_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cert_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_namehash` text NOT NULL,
	`subject_ens_name` text NOT NULL,
	`tier` text NOT NULL,
	`customer_wallet` text NOT NULL,
	`price_usd_cents` integer NOT NULL,
	`price_usdc_raw` text NOT NULL,
	`price_eth_wei` text,
	`eth_usd_rate_at_request` text,
	`receiving_address` text NOT NULL,
	`state` text DEFAULT 'REQUESTED' NOT NULL,
	`payment_chain_id` integer,
	`payment_tx_hash` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL,
	`paid_at` integer,
	`issued_at` integer,
	`cert_uid` text,
	`refusal_reason` text
);
--> statement-breakpoint
CREATE TABLE `certificates` (
	`uid` text PRIMARY KEY NOT NULL,
	`subject_namehash` text NOT NULL,
	`subject_ens_name` text NOT NULL,
	`tier` text NOT NULL,
	`score` integer NOT NULL,
	`score_formula_version` text NOT NULL,
	`issued_at` integer NOT NULL,
	`valid_until` integer NOT NULL,
	`evidence_bundle_hash` text NOT NULL,
	`ai_provenance_hash` text,
	`forensic_hash` text,
	`signer` text NOT NULL,
	`previous_uid` text,
	`schema_uid` text NOT NULL,
	`chain_id` integer NOT NULL,
	`agents_succeeded` integer NOT NULL,
	`agents_total` integer NOT NULL,
	`request_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_records` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`tx_hash` text NOT NULL,
	`chain_id` integer NOT NULL,
	`payer_address` text NOT NULL,
	`token_address` text NOT NULL,
	`amount_raw` text NOT NULL,
	`amount_usd_cents` integer NOT NULL,
	`block_number` integer NOT NULL,
	`block_timestamp` integer NOT NULL,
	`verified_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`namehash` text PRIMARY KEY NOT NULL,
	`ens_name` text NOT NULL,
	`primary_address` text,
	`manifest_hash` text,
	`manifest_signer_verified` integer DEFAULT false NOT NULL,
	`kind` text NOT NULL,
	`last_resolved_at` integer DEFAULT (unixepoch()) NOT NULL
);
