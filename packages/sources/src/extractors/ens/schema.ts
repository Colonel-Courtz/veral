import { z } from 'zod';

const addressSchema = z.custom<`0x${string}`>(
  (v) => typeof v === 'string' && /^0x[a-f0-9]{40}$/.test(v),
  'address must be lowercase 0x-prefixed 20 bytes',
);

const namehashSchema = z.custom<`0x${string}`>(
  (v) => typeof v === 'string' && /^0x[a-f0-9]{64}$/.test(v),
  'namehash must be lowercase 0x-prefixed 32 bytes',
);

// trust: 'verified' is structural — ENS Registry / BaseRegistrar reads
// resolve directly against the chain, and the ENS subgraph is a
// deterministic index of those same events.
//
// Numeric fields are typed as number (not bigint) so the findings
// payload is JSON-safe for the Upstash cache and the canonical-JSON
// provenance hash. The score-adapter widens lastUpdateBlock to bigint
// at the boundary if the engine consumer needs it.
export const ensFindingsSchema = z.object({
  trust: z.literal('verified'),
  ensName: z.string().min(1),
  namehash: namehashSchema,
  registrationTimestamp: z.number().int().min(0).nullable(),
  expiryTimestamp: z.number().int().min(0).nullable(),
  subnameCount: z.number().int().min(0),
  textRecordKeys: z.array(z.string()),
  resolverAddress: addressSchema.nullable(),
  lastUpdateBlock: z.number().int().min(0).nullable(),
});

export type EnsFindings = z.infer<typeof ensFindingsSchema>;
