# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Veral, please report it privately.

**Email:** security@veral.tech
**PGP key:** to be published

**Please include:**

- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested remediation (if known)

## Response SLA

| Severity | Acknowledgement | First update | Patch target |
|---|---|---|---|
| Critical | 24 hours | 48 hours | 7 days |
| High | 48 hours | 5 days | 14 days |
| Medium | 5 days | 14 days | 30 days |
| Low | 14 days | 30 days | Next release |

## Scope

In scope:

- Operator signing key custody and signature verification
- Smart contracts (VeralPaymentForwarder, VeralVerifier)
- API endpoints under `veral.tech/api/*`
- EAS attestation schema correctness
- Source-data fetching and provenance

Out of scope:

- Third-party services (Vercel, Turso, Upstash, Alchemy, EAS contracts)
- Issues requiring physical access
- Social engineering of the Veral team
- DoS via excessive but legitimate API calls

## Bug Bounty

A formal bug bounty program will launch alongside the v1.0 production release.
Until then, we acknowledge responsible disclosure in the project changelog.

## Disclosure Policy

We follow coordinated disclosure. Once a fix is available, we publish a
post-mortem in `docs/postmortems/` describing the issue, root cause, and
remediation. Vulnerabilities affecting customer-issued certificates trigger
proactive notification to affected customers.
