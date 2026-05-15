# Veral

**Verification Authority Layer for Ethereum.**

Production: [veral.tech](https://veral.tech)

Veral reads twenty public sources of evidence behind any ENS-named subject — Sourcify-verified contracts, GitHub activity, on-chain history, ENS records, EAS attestations, audit registries, and more — and computes a deterministic 0–100 reputation score with every contributing signal visible. Every score is publishable as an EAS attestation, bound to the subject's ENS namehash via full-payload EIP-712 signature.

We do not predict trust. We compute it.

## Status

v1.0 in development. Twenty-source rollout, three-tier certificate model, ENS Service Provider Program submission.

## Architecture

```
veral/
├── apps/
│   └── web/                  Next.js 16 App Router — primary product surface
├── packages/
│   ├── core/                 Core orchestration + types
│   ├── sources/              Twenty data-source adapters (one per source)
│   ├── score/                Score engine — single, deterministic, open-source formula
│   ├── attest/               EAS attestation publishing + EIP-712 signing
│   └── shared/               Shared types + utilities
├── contracts/                Foundry — Solidity contracts (operator hooks, mocks)
├── scripts/                  Deploy + maintenance scripts
└── docs/                     Architecture + roadmap docs
```

## Three-tier certificate model

| Tier | Price | Source coverage |
|---|---|---|
| **Public** | $0.50–$2 | On-chain + ENS-internal + EAS read |
| **Anchored** | $5–$20 | Owner-signed manifest + 12–15 sources verified |
| **Sealed** | $50–$500 | 18–20 sources verified + ZK proof + cross-sign |

Score lookup and breakdown remain free forever. Only certificate publishing is paid.

## Stack

- Next.js 16 App Router + Tailwind 4
- pnpm workspaces, Node 24, TypeScript strict
- Foundry for smart contracts
- Vercel Pro + Fluid Compute + AI Gateway
- Turso (libSQL), Vercel Blob, Upstash Redis
- viem + wagmi + ConnectKit
- Sourcify v2, EAS SDK, ENS resolution

## Sponsors

- **Sourcify** — primary evidence layer, only verified seniority source
- **ENS** — universal subject registry, identity anchor, namehash-bound attestations
- **EAS** — attestation transport, on-chain reputation publishing
- **Future Society** — public-good transparency primitive

## License

MIT
