---
'@cipherstash/cli': minor
---

Reduce friction in `stash init`.

- **No more "How will you connect to your database?" prompt.** Init now auto-detects Drizzle (from `drizzle.config.*` or `drizzle-orm`/`drizzle-kit` in `package.json`) and Supabase (from the host in `DATABASE_URL`), and silently picks the matching encryption client template. Falls back to a generic Postgres template otherwise.
- **No more "Where should we create your encryption client?" prompt.** Init writes to `./src/encryption/index.ts` by default. The "file already exists, what would you like to do?" prompt still appears so existing client files aren't silently overwritten.
- **Single combined dependency-install prompt.** Previously init asked twice (once for `@cipherstash/stack`, once for `@cipherstash/cli`). It now asks once, listing both, and runs the installs in sequence. When both packages are already in `node_modules`, no prompt appears at all.
- **Already-authenticated users skip the "Continue with workspace X?" prompt.** Init logs `Using workspace X` and proceeds. Run `stash auth login` directly to switch workspaces.

`stash db install` now also calls into the same encryption-client scaffolder as a safety net — users who run `db install` without `init` first still get a working client file generated at the path their `stash.config.ts` points to.
