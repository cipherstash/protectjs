---
---

Apply supply-chain security best practices from [lirantal/npm-security-best-practices](https://github.com/lirantal/npm-security-best-practices) as enforced repo configuration plus a vitest gate that fails CI if any practice regresses.

Config: bump pnpm to 10.33.2; add `minimumReleaseAge: 10080` (7-day install cooldown) and `blockExoticSubdeps: true` to `pnpm-workspace.yaml`; pin default + `@cipherstash` registry to npmjs via committed `.npmrc`; switch CI to `pnpm install --frozen-lockfile` on Node 22; add `.github/dependabot.yml` with cooldown'd grouped updates for npm + github-actions; add `.github/CODEOWNERS` protecting supply-chain critical paths.

Test gate (`e2e/tests/supply-chain.e2e.test.ts`, 12 cases): asserts each invariant above, plus that every `pnpm-lock.yaml` entry resolves via `registry.npmjs.org` (substitutes for `lockfile-lint`, which doesn't support pnpm).

Docs: new `skills/stash-supply-chain-security/SKILL.md` with the full guide; `AGENTS.md` Supply Chain Security section.

No changes to any published package — release-side practices (#11 provenance, #12 OIDC trusted publishing) are deferred to a follow-up that requires npmjs.com Trusted Publisher configuration first.
