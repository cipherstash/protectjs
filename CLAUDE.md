# CLAUDE.md — Stash Encryption (protectjs)

End-to-end, per-value encryption for JS/TS with zero-knowledge key management (CipherStash ZeroKMS). Encrypted data stored as EQL JSON payloads; searchable encryption supported for PostgreSQL.

## Quick reference

```bash
pnpm install                          # install (requires pnpm 10.x, Node >= 22)
pnpm run build                        # build all packages (Turborepo + tsup)
pnpm run dev                          # watch mode
pnpm test                             # run all package tests (Vitest)
pnpm --filter @cipherstash/stack test    # test a single package
pnpm run code:fix                     # lint + format (Biome)
pnpm changeset                        # create a changeset for release
```

## Monorepo structure

pnpm workspaces with Turborepo orchestration. Packages under `packages/*`, examples under `examples/*`.

| Package | Purpose |
|---------|---------|
| `protect` | Deprecated — re-exports from `stack` for backward compatibility |
| `stack` | Core library — encrypt/decrypt, FFI bridge to `@cipherstash/protect-ffi` |
| `schema` | Schema builder (`encryptedTable`, `encryptedColumn`, `buildEncryptConfig`) |
| `nextjs` | Next.js helpers and Clerk integration |
| `dynamodb` | DynamoDB helpers |
| `drizzle` | Drizzle ORM integration |
| `utils` | Shared config and logger |

Build order is managed by Turborepo (`^build` dependency). Each package uses `tsup` for bundling.

## Critical constraints

1. **Native FFI** — `@cipherstash/protect-ffi` is a Node-API native module loaded via `require`. Bundlers **must** externalize it (Next.js: `serverExternalPackages`; SST/serverless: see `docs/how-to/`).
2. **No plaintext logging** — The library never logs plaintext by design. Never add logs that could leak sensitive data.
3. **Result contract** — All operations return `{ data }` or `{ failure }` with stable error `type` strings from `EncryptionErrorTypes`. Do not change this shape.
4. **EQL payload shape is contract** — Keys like `c` in encrypted payloads are validated by tests and downstream tools. Do not alter.
5. **ESM + CJS** — Every package's `exports` map must keep both `import` and `require` fields. Do not remove CJS support.
6. **Bun is not supported** — Node-API compatibility gaps. Use Node.js only.

## Environment variables (for tests/examples)

```bash
CS_WORKSPACE_CRN=        # required for live encryption tests
CS_CLIENT_ID=
CS_CLIENT_KEY=
CS_CLIENT_ACCESS_KEY=
USER_JWT=                 # optional — identity-aware encryption tests
USER_2_JWT=
PROTECT_LOG_LEVEL=debug|info|error
```

Tests requiring credentials will fail or be skipped without these.

## Code style

- Biome for formatting and linting (single quotes, no semicolons, 2-space indent)
- `noThenProperty` lint rule is disabled (operations use thenable pattern)
- Tests use Vitest with `.test.ts` files under each package's `__tests__/`
- Test via public API; avoid reaching into private internals

## Making changes checklist

1. Identify target package(s); check if changes affect public APIs or payload shapes
2. Preserve Result contract, `.withLockContext()` chaining, and ESM/CJS exports
3. Add/extend tests in the same package
4. Run: `pnpm run code:fix && pnpm --filter <pkg> build && pnpm --filter <pkg> test`
5. Create a changeset (`pnpm changeset`) if the change affects published packages
