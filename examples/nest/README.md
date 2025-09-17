# Protect.js Example with NestJS

> ⚠️ **Heads-up:** This example was generated with AI with some very specific prompting to make it as useful as possible for you :)
> If you find any issues, think this example is absolutely terrible, or would like to speak with a human, book a call with the [CipherStash solutions engineering team](https://calendly.com/cipherstash-gtm/cipherstash-discovery-call?month=2025-09)

## What this shows
- Field-level encryption on 2+ properties via `encryptModel`/`decryptModel` and bulk variants
- Identity-aware encryption is supported (optional `LockContext` chaining)
- Result contract preserved: operations return `{ data }` or `{ failure }`

## 90-second Quickstart
```bash
pnpm install
cp .env.example .env
pnpm start:dev
```

Environment variables (in `.env`):
```bash
CS_WORKSPACE_CRN=
CS_CLIENT_ID=
CS_CLIENT_KEY=
CS_CLIENT_ACCESS_KEY=
```

### How encryption works here
- `src/protect/schema.ts` defines tables with `.equality()`, `.orderAndRange()`, `.freeTextSearch()` for searchable encryption on Postgres.
- `ProtectModule` initializes a `ProtectClient` with those schemas and injects a `ProtectService`.
- `AppService` uses `encryptModel`/`decryptModel` and bulk variants to demonstrate single and bulk flows.

### Minimal API demo
- `GET /` — returns a demo payload with encrypted and decrypted models and a bulk example
- `POST /users` — encrypts provided fields and returns the encrypted model
- `GET /users/:id` — decrypts a provided encrypted model (demo flow)

### Scripts
- `pnpm start:dev` — run in watch mode
- `pnpm test` / `pnpm test:e2e`

### Troubleshooting
- Ensure `.env` has all required `CS_*` variables; lock-context flows require user JWTs.
- Node 22+ is required; Bun is not supported.
- If you integrate bundlers, externalize `@cipherstash/protect-ffi` (native module).

### References
- Protect.js: see repo root `README.md`
- NestJS docs: `https://docs.nestjs.com/`
- Next.js external packages: `docs/how-to/nextjs-external-packages.md`
- SST external packages: `docs/how-to/sst-external-packages.md`
- npm lockfile v3 on Linux: `docs/how-to/npm-lockfile-v3.md`