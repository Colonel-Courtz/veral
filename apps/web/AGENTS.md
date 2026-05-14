# apps/web — agent guidance

## Purpose

Next.js 16 App Router application. Public surface of Veral on https://veral.tech. Renders:

- Marketing pages (home, pricing, docs)
- Bench Mode `/b/[name]` — public score lookup for any ENS name
- Contract Risk `/r/[name]` — per-upgrade verdict surface
- Cert lookup `/lookup/[uid]` — EAS attestation comparator
- Customer dashboard (post-SIWE)
- API routes under `/api/*`

## Boundary

- Imports allowed: all `@veral/*` packages, React 19, Next.js 16, Tailwind 4, viem, wagmi
- This is the **top of the dependency graph**. No other package depends on `apps/web`.

## Directory structure

```
app/
├── page.tsx                      # Marketing hero
├── layout.tsx                    # Root layout
├── globals.css                   # Tailwind 4 with @theme
├── b/[name]/
│   ├── page.tsx                  # Bench Mode UI (Server Component)
│   └── loading.tsx
├── r/[name]/
│   ├── page.tsx                  # Contract Risk UI
│   └── loading.tsx
├── lookup/[uid]/
│   └── page.tsx                  # Cert lookup + diff
├── api/
│   ├── cert/
│   │   ├── request-issue/route.ts
│   │   ├── [id]/status/route.ts
│   │   └── [uid]/route.ts
│   ├── bench/[name]/route.ts     # Free public score
│   └── webhooks/payment/route.ts # Forwarder event webhook
└── ...

components/                       # Presentational React components
lib/                              # Server-only utilities (db client, redis client)
```

## Architectural rules (binding — see CLAUDE.md rule 6)

1. **Runtime data NEVER in `public/`.** Use Turso for relational state, Vercel Blob for files, Upstash Redis for cache.
2. **Server Components by default.** Use `'use client'` only when interactivity requires it.
3. **No business logic in route handlers.** Route handler is a thin wrapper around `@veral/core` orchestration functions.
4. **Edge runtime forbidden for cert issuance.** Cert flow needs Node.js runtime (signing, DB writes). Use `export const runtime = 'nodejs'` explicitly.
5. **All API responses typed.** Define response shape with Zod, validate before serialize.

## Forbidden

- Direct DB queries in route handlers (use `@veral/shared/db`)
- Direct LLM calls in components (LLMs live in `@veral/sources/agents/ai-analysis`)
- Hardcoding cert content (always fetched from `@veral/core`)
- Storing customer data in browser localStorage (use SIWE session)
- Reading operator private key here (signing happens in `@veral/attest` via Vercel function env)
- Emoji in any component or copy

## Component testing

- Presentational components without logic: no test required
- Components with conditional rendering or computed display: add a test
- Coverage target: 50%+ (heavy presentation surface, low test-to-value ratio for pure JSX)

## Performance budgets

- Bench Mode `/b/[name]` LCP target: < 2.5s on 4G
- API route response time targets:
  - `GET /api/bench/[name]`: p50 < 500ms, p99 < 2s (cache-warm)
  - `POST /api/cert/request-issue`: p50 < 200ms (creates DB row only)
  - `GET /api/cert/[uid]`: p50 < 300ms (DB + EAS lookup)

## When asked to "add a new route"

1. Decide: Server Component (default) or `'use client'`?
2. Add page under `app/<segment>/page.tsx`
3. Add corresponding API route if needed under `app/api/<segment>/route.ts`
4. Route handler MUST be < 50 lines (thin wrapper around core)
5. Update `apps/web/sitemap.ts` to include new public route
6. Add E2E test under `e2e/` if user-facing
