---
"@cipherstash/drizzle": minor
---

Added `generate-eql-migration` CLI command to automate EQL migration generation.

This command consolidates the manual process of running `drizzle-kit generate --custom` and populating the SQL file into a single command. It uses the bundled EQL SQL from `@cipherstash/schema` for offline-friendly, version-locked installations.

Usage:
```bash
npx generate-eql-migration
npx generate-eql-migration --name setup-eql
npx generate-eql-migration --out migrations
```
