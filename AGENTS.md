This is the Stash Encryption repository (protectjs) - End-to-end, per-value encryption for JavaScript/TypeScript with zero‑knowledge key management (via CipherStash ZeroKMS). Encrypted data is stored as EQL JSON payloads; searchable encryption is currently supported for PostgreSQL.

## Prerequisites

- **Node.js**: >= 22 (enforced in `package.json` engines)
- **pnpm**: 9.x (this repo uses pnpm workspaces and catalogs)
- Internet access to install the prebuilt native module `@cipherstash/protect-ffi`

If running integration tests or examples, you will also need CipherStash credentials (see Environment variables below).

## Building and Running

### Install

```bash
pnpm install
```

### Build all packages

```bash
pnpm run build
# or only JS libraries
pnpm run build:js
```

Under the hood this uses Turborepo to build `./packages/*` with each package’s `tsup` configuration.

### Dev/watch

```bash
pnpm run dev
```

### Tests

- Default: run package tests via Turborepo

```bash
pnpm test
```

- Filter to a single package (recommended for fast iteration):

```bash
pnpm --filter @cipherstash/stack test
pnpm --filter @cipherstash/nextjs test
```

Tests use **Vitest**. Many tests talk to the real CipherStash service; they require environment variables. Some tests (e.g., lock context) are skipped if optional tokens aren’t present.

### Environment variables required for runtime/tests

Place these in a local `.env` at the repo root or specific example directory:

```bash
CS_WORKSPACE_CRN=
CS_CLIENT_ID=
CS_CLIENT_KEY=
CS_CLIENT_ACCESS_KEY=

# Optional – enables identity-aware encryption tests
USER_JWT=
USER_2_JWT=

# Logging (plaintext is never logged by design)
PROTECT_LOG_LEVEL=debug|info|error
```

If these variables are missing, tests that require live encryption will fail or be skipped; prefer filtering to specific packages and tests while developing.

## Repository Layout

- `packages/stack`: Core library (published as `@cipherstash/stack`)
  - `src/index.ts`: Public API (`Encryption`, exports)
  - `src/ffi/index.ts`: `EncryptionClient` implementation, bridges to `@cipherstash/protect-ffi`
  - `src/ffi/operations/*`: Encrypt/decrypt/model/bulk/search-terms operations (thenable pattern with optional `.withLockContext()`)
  - `__tests__/*`: End-to-end and API contract tests (Vitest)
- `packages/protect`: Deprecated — re-exports from `stack` for backward compatibility
- `packages/schema`: Schema builder utilities and types (`encryptedTable`, `encryptedColumn`, `buildEncryptConfig`)
- `packages/nextjs`: Next.js helpers and Clerk integration (`./clerk` export)
- `packages/dynamodb`: DynamoDB helpers (published as `@cipherstash/protect-dynamodb`)
- `packages/utils`: Shared config (`utils/config`) and logger (`utils/logger`)
- `examples/*`: Working apps (basic, drizzle, nextjs-clerk, next-drizzle-mysql, dynamo, hono-supabase)
- `docs/*`: Concepts, how-to guides (Next.js bundling, SST, npm lockfile v3), reference

## Key Concepts and APIs

- **Initialization**: `Encryption({ schemas })` returns an initialized `EncryptionClient`. Provide at least one `encryptedTable`.
- **Schema**: Define tables/columns with `encryptedTable` and `encryptedColumn`. Add `.freeTextSearch().equality().orderAndRange()` to enable searchable encryption on PostgreSQL.
- **Operations** (all return Result-like objects and support chaining `.withLockContext(lockContext)` when applicable):
  - `encrypt(plaintext, { table, column })`
  - `decrypt(encryptedPayload)`
  - `encryptModel(model, table)` / `decryptModel(model)`
  - `bulkEncrypt(plaintexts[], { table, column })` / `bulkDecrypt(encrypted[])`
  - `bulkEncryptModels(models[], table)` / `bulkDecryptModels(models[])`
  - `createSearchTerms(terms)` for searchable queries
- **Identity-aware encryption**: Use `LockContext` from `@cipherstash/stack/identity` and chain `.withLockContext()` on operations. Same context must be used for both encrypt and decrypt.

## Critical Gotchas (read before coding)

- **Native Node.js module**: Stash Encryption relies on `@cipherstash/protect-ffi` (Node-API). It must be loaded via native Node.js `require`. Do NOT bundle this module; configure bundlers to externalize it.
  - Next.js: see `docs/how-to/nextjs-external-packages.md`
  - SST/Serverless: see `docs/how-to/sst-external-packages.md`
  - npm lockfile v3 on Linux: see `docs/how-to/npm-lockfile-v3.md`
- **Bun is not supported**: Due to Node-API compatibility gaps. Use Node.js.
- **Do not log plaintext**: The library never logs plaintext by design. Don’t add logs that risk leaking sensitive data.
- **Result shape is contract**: Operations return `{ data }` or `{ failure }`. Preserve this shape and error `type` values in `EncryptionErrorTypes`.
- **Encrypted payload shape is contract**: Keys like `c` in the EQL payload are validated by tests and downstream tools. Don’t change them.
- **Exports must support ESM and CJS**: Each package’s `exports` maps must keep both `import` and `require` fields. Don’t remove CJS.

## Development Workflow

- **Formatting/Linting**: Use Biome

```bash
pnpm run code:fix
```

- **Build**: `pnpm run build` (Turborepo + tsup per package)
- **Test**: `pnpm --filter <pkg> test` for targeted iterations
- **Releases**: Use Changesets

```bash
pnpm changeset        # create a changeset
pnpm changeset:version
pnpm changeset:publish
```

### Writing tests

- Use Vitest with `.test.ts` files under each package’s `__tests__/`.
- Import `dotenv/config` at the top when tests need environment variables.
- Prefer testing via the public API. Avoid reaching into private internals.
- Some tests have larger timeouts (e.g., 30s) to accommodate network calls.

## Bundling and Deployment Notes

- When integrating into frameworks/build tools, ensure native modules are externalized and loaded via Node’s runtime require.
- For Next.js, configure `serverExternalPackages` as documented in `docs/how-to/nextjs-external-packages.md`.
- For serverless/Linux targets with npm lockfile v3, see `docs/how-to/npm-lockfile-v3.md` to avoid runtime load errors.

## Adding Features Safely (LLM checklist)

1. Identify the target package(s) in `packages/*` and confirm whether changes affect public APIs or payload shapes.
2. If modifying `packages/stack` operations or `EncryptionClient`, ensure:
   - The Result contract and error type strings remain stable.
   - `.withLockContext()` remains available for affected operations.
   - ESM/CJS exports continue to work (don’t break `require`).
3. If changing schema behavior (`packages/schema`), update type definitions and ensure `buildEncryptConfig` still validates with Zod in `EncryptionClient.init`.
4. Add/extend tests in the same package. For features that require live credentials, guard with env checks or provide mock-friendly paths.
5. Run:
   - `pnpm run code:fix`
   - `pnpm --filter <changed-pkg> build`
   - `pnpm --filter <changed-pkg> test`
6. Update docs in `docs/*` and usage examples if APIs change.

## Useful Links in this repo

- `README.md` for quickstart and feature overview
- `docs/concepts/searchable-encryption.md`
- `docs/reference/schema.md`
- `docs/reference/searchable-encryption-postgres.md`
- `docs/how-to/nextjs-external-packages.md`
- `docs/how-to/sst-external-packages.md`
- `docs/how-to/npm-lockfile-v3.md`

## Troubleshooting

- Module load errors on Linux/serverless: review the npm lockfile v3 guide.
- Can’t decrypt after encrypting with a lock context: ensure the exact same lock context is provided to decrypt.
- Tests failing due to missing credentials: provide `CS_*` env vars; lock-context tests are skipped without `USER_JWT`.
- Performance testing: prefer bulk operations (`bulkEncrypt*` / `bulkDecrypt*`) to exercise ZeroKMS bulk speed.


