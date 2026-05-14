# Changelog

All notable changes to Veral are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial Veral monorepo scaffold (pnpm workspaces)
- `@veral/shared` package: tier types, agent interfaces, subject types, error hierarchy
- Next.js 16 web app skeleton with Tailwind 4 hero page
- Five architecture decision records (ADR-000 through ADR-004)
- Production deploy on Vercel at https://veral.tech with Let's Encrypt SSL
- GitHub Actions CI/CD: typecheck, build, test, Biome lint, dependency cycle check, CodeQL
- Pre-commit hooks via lefthook
- Conventional Commits via commitlint
- Dependabot for weekly dependency updates
- Anti-bloat enforcement: custom rules in CLAUDE.md, runtime-data guard in CI

[Unreleased]: https://github.com/B2JK-Industry/veral/commits/main
