# Stash Encryption documentation

The documentation for Stash Encryption is organized into the following sections:

- [Getting started](./getting-started.md)

## Concepts

- [Searchable encryption](./concepts/searchable-encryption.md)

## Reference

- [Configuration and production deployment](./reference/configuration.md)
- [Searchable encryption with PostgreSQL](./reference/searchable-encryption-postgres.md)
- [Stash Encryption schemas](./reference/schema.md)
- [Model operations with bulk crypto functions](./reference/model-operations.md)

### ORMs and frameworks

- [Supabase SDK](./reference/supabase-sdk.md)

### Drizzle ORM Integration

- [Protect Operators Pattern](reference/drizzle/drizzle.md) - Recommended approach with auto-encrypting operators
- [Manual Encryption Pattern](reference/drizzle/drizzle-protect.md) - Explicit control over encryption workflow

## How-to guides

- [Lock contexts with Clerk and Next.js](./how-to/lock-contexts-with-clerk.md)
- [Next.js build notes](./how-to/nextjs-external-packages.md)
- [SST and serverless function notes](./how-to/sst-external-packages.md)
