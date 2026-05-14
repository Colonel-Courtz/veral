<!-- See CONTRIBUTING.md for full workflow. Every checklist item must be addressed. -->

## Linked issue

Closes #<!-- issue number -->

## Summary

<!-- What changed and why. Do NOT describe what the original ticket was -->

## Architecture impact

- [ ] No architectural impact (small change within an existing pattern)
- [ ] New ADR added: `docs/architecture/<file>.md`
- [ ] Existing ADR amended: `docs/architecture/<file>.md`

## CLAUDE.md compliance

- [ ] No reference-tag comments (no `// US-XXX`, `// GATE-XXX`, `// EPIC §X` patterns)
- [ ] No file-header description blocks
- [ ] No parallel abstractions (existing systems modified, not wrapped)
- [ ] No runtime data committed to `apps/web/public/`
- [ ] Comments explain WHY, not WHAT
- [ ] No emoji in code, markdown, or commit messages
- [ ] Single source of truth maintained per concept

## Package boundaries

- [ ] Modified package's `AGENTS.md` boundaries respected
- [ ] No new cross-package imports outside the allowed dependency graph
- [ ] No cyclic dependencies introduced (verified via `pnpm exec madge --circular`)

## Tests

- [ ] Unit tests added or updated for new logic
- [ ] Existing tests still pass locally (`pnpm test`)
- [ ] Coverage threshold respected for the affected package

## Verification

- [ ] Vercel preview deploy reachable (link auto-commented by CI)
- [ ] Manual smoke test of changed surface

## Notes for reviewer

<!-- Optional: anything the reviewer should pay particular attention to -->
