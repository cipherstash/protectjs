# Documentation Drift Testing

This document describes the documentation drift detection system for the Drizzle + Stash Encryption integration. The system ensures that code examples in documentation remain executable and accurate as the codebase evolves.

## Overview

Documentation drift occurs when code examples become outdated due to API changes, breaking changes, or refactoring. This test suite automatically executes code blocks from markdown documentation against a live database, catching drift before it reaches users.

**Key benefits:**
- Code examples are guaranteed to work
- API changes that break examples are caught in CI
- Documentation stays synchronized with implementation
- Reduces manual documentation maintenance

## Project Structure

```
packages/drizzle/
├── __tests__/
│   ├── docs.test.ts                    # Main drift detection test suite
│   ├── fixtures/
│   │   └── doc-seed-data.ts            # Test data for documentation examples
│   └── utils/
│       ├── markdown-parser.ts          # Extracts executable blocks from markdown
│       ├── markdown-parser.test.ts     # Parser unit tests (with property-based tests)
│       ├── code-executor.ts            # Executes code blocks in controlled context
│       └── code-executor.test.ts       # Executor unit tests
│
docs/reference/drizzle/
├── drizzle.md                          # Encryption operators pattern (recommended)
├── drizzle-protect.md                  # Manual encryption pattern (verbose)
└── DRIFT-TESTING.md                    # This document
```

## How It Works

### 1. Markdown Parser

The parser (`markdown-parser.ts`) scans documentation files for executable code blocks marked with the `` ```ts:run `` fence:

```markdown
## Section Name

Some explanation text...

​```ts:run
const results = await db.select().from(transactions)
return results
​```
```

**Key features:**
- Extracts only blocks with `ts:run` language tag
- Tracks section headers for test naming
- Records line numbers for error reporting
- Ignores regular `typescript` or `ts` blocks

### 2. Code Executor

The executor (`code-executor.ts`) runs extracted code blocks in a controlled context:

```typescript
const context: ExecutionContext = {
  db,                    // Drizzle database instance
  transactions,          // Table schema
  encryption,            // Encryption operators (eq, gte, like, etc.)
  encryptionClient,         // Encryption client for manual encryption
  encryptionTransactions,   // Encryption schema for encryption
  eq, gte, lte, ilike,   // Drizzle operators
  and, or, desc, asc,    // Drizzle combinators
  sql, inArray,          // Drizzle utilities
}

const result = await executeCodeBlock(block.code, context)
```

**Security note:** The executor uses `Function()` constructor (similar to `eval`). This is safe because:
- Code comes only from our repository's documentation files
- All code goes through PR review before merge
- Tests run in CI/local dev, never in production
- Executed code only accesses explicitly provided context

### 3. Seed Data

The seed data (`doc-seed-data.ts`) provides consistent test records that documentation examples query against:

```typescript
export const docSeedData = [
  {
    account: '1234567890',
    amount: 800.0,
    description: 'Salary deposit',
    createdAt: daysAgo(10),
  },
  // ... 14 more records
]
```

**Date strategy:** Uses relative dates (`daysAgo()`) so tests remain valid regardless of when they run.

**Seed data mapping:**

| Record | Account | Amount | Description | Used In |
|--------|---------|--------|-------------|---------|
| 0 | 1234567890 | 800.00 | Salary deposit | Equality matching, Combined queries |
| 1 | 0987654321 | 150.00 | Gym membership | Free text search (`%gym%`) |
| 2 | 1234567890 | 1250.00 | Rent payment | Range queries (amount > 1000) |
| 3-11 | various | various | various | Ordering, pagination examples |
| 12 | 1010101010 | 60.00 | Gym supplements | Free text search (second gym match) |
| 13 | 1212121212 | 2000.00 | Bonus deposit | Range queries (high amount) |
| 14 | 1313131313 | 35.00 | Book purchase | Range queries (low amount) |

## Running Tests

### Prerequisites

#### 1. PostgreSQL Database with EQL

The project does not include a Docker Compose setup. You need a PostgreSQL database with EQL v2 types installed.

**Option A: Use an existing PostgreSQL instance**

```bash
# Download EQL install script
curl -sLo cipherstash-encrypt.sql \
  https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt.sql

# Install EQL types and functions
psql -d your_database -f cipherstash-encrypt.sql
```

**Option B: Quick Docker setup**

```bash
# Start PostgreSQL
docker run -d --name protectjs-test \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=protectjs_test \
  -p 5432:5432 \
  postgres:16

# Wait for startup, then install EQL
curl -sLo cipherstash-encrypt.sql \
  https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt.sql

PGPASSWORD=postgres psql -h localhost -U postgres -d protectjs_test -f cipherstash-encrypt.sql
```

**Option C: Use Supabase**

If using Supabase, download the Supabase-specific EQL script:

```bash
curl -sLo cipherstash-encrypt-supabase.sql \
  https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt-supabase.sql
```

#### 2. CipherStash Credentials

Sign up at [CipherStash Dashboard](https://cipherstash.com/signup), create a workspace, and generate client credentials.

#### 3. Environment Variables

Create `packages/drizzle/.env`:

```bash
# Database connection
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/protectjs_test

# CipherStash credentials (from dashboard)
CS_WORKSPACE_CRN=your-workspace-crn
CS_CLIENT_ID=your-client-id
CS_CLIENT_KEY=your-client-key
CS_CLIENT_ACCESS_KEY=your-access-key
```

#### 4. Create Test Table

The test suite uses a table called `drizzle-docs-test`. Create it manually or let the first test run create it:

```sql
CREATE TABLE IF NOT EXISTS "drizzle-docs-test" (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  account_number eql_v2_encrypted,
  amount eql_v2_encrypted,
  description eql_v2_encrypted,
  created_at eql_v2_encrypted
);
```

### Running All Tests

```bash
# From repository root
pnpm test --filter @cipherstash/drizzle

# Or from packages/drizzle
cd packages/drizzle
pnpm test
```

### Running Only Unit Tests (No Database Required)

```bash
cd packages/drizzle
pnpm vitest run __tests__/utils/
```

This runs the markdown parser and code executor unit tests without requiring database credentials.

### Running Only Documentation Drift Tests

```bash
cd packages/drizzle
pnpm vitest run __tests__/docs.test.ts
```

## Adding New Documentation Examples

### Step 1: Write the Example

Add your code block to the appropriate documentation file using the `ts:run` fence:

```markdown
## Your Section Title

Explanation of what this example demonstrates.

​```ts:run
// Your executable code here
const results = await db.select()
  .from(transactions)
  .where(await encryption.eq(transactions.amount, 800.00))
return results
​```
```

### Step 2: Ensure Seed Data Supports Your Example

Check if your example needs specific data:

1. **Review existing seed data** in `__tests__/fixtures/doc-seed-data.ts`
2. **Add new records** if needed for your example
3. **Update the mapping table** in the seed data file's JSDoc

Example: Adding a record for a new "refund" example:

```typescript
// In doc-seed-data.ts
export const docSeedData = [
  // ... existing records ...
  {
    account: '1414141414',
    amount: -50.0,  // Negative for refund
    description: 'Refund for damaged item',
    createdAt: daysAgo(2),
  },
]
```

### Step 3: Verify Your Example Works

Run the tests to ensure your new example executes successfully:

```bash
cd packages/drizzle
pnpm vitest run __tests__/docs.test.ts
```

### Step 4: Check Test Output

If your example fails, the test output shows:
- The section name where the block appears
- The line number in the markdown file
- The code that failed
- The error message

```
Failed block at line 156:
---
const results = await db.select()
  .from(transactions)
  .where(await encryption.eq(transactions.nonexistent, 'value'))
return results
---
Error: Column "nonexistent" does not exist
```

## Available Context Variables

When writing `ts:run` blocks, these variables are available:

### Database & Schema
| Variable | Type | Description |
|----------|------|-------------|
| `db` | Drizzle instance | Database connection |
| `transactions` | Table schema | The test table definition |
| `encryptionTransactions` | Encryption schema | Schema for encryption operations |

### Encryption Operators (Auto-Encrypting)
| Variable | Description |
|----------|-------------|
| `encryption.eq(column, value)` | Equality match on encrypted field |
| `encryption.gte(column, value)` | Greater than or equal |
| `encryption.lte(column, value)` | Less than or equal |
| `encryption.like(column, pattern)` | Text search with wildcards |

### Encryption Client (Manual Encryption)
| Variable | Description |
|----------|-------------|
| `encryptionClient.encrypt(value, opts)` | Encrypt a single value |
| `encryptionClient.bulkDecryptModels(results)` | Decrypt query results |

### Drizzle Operators
| Variable | Description |
|----------|-------------|
| `eq`, `gte`, `lte`, `ilike` | Comparison operators |
| `and`, `or` | Logical combinators |
| `desc`, `asc` | Ordering functions |
| `sql` | Raw SQL template tag |
| `inArray` | IN clause helper |

## Writing Effective Examples

### Do's

✅ **Return results** - Each block must return something:
```typescript
const results = await db.select().from(transactions)
return results
```

✅ **Use relative dates** for time-based queries:
```typescript
const now = new Date()
const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
```

✅ **Match seed data values** when demonstrating specific queries:
```typescript
// Seed has account '1234567890' with amount 800.00
await encryption.eq(transactions.account, '1234567890')
```

✅ **Keep examples focused** - one concept per block

### Don'ts

❌ **Don't use hardcoded dates** that will become stale:
```typescript
// BAD - will fail when seed data changes
const date = new Date('2024-12-15T00:00:00Z')
```

❌ **Don't modify data** - tests are read-only:
```typescript
// BAD - INSERT/UPDATE/DELETE are not supported
await db.insert(transactions).values({...})
```

❌ **Don't rely on specific IDs** - they're auto-generated:
```typescript
// BAD - ID depends on insertion order
.where(eq(transactions.id, 5))
```

❌ **Don't forget to return** - blocks without return may pass but show no results

## Troubleshooting

### "Missing env.DATABASE_URL"
Set up your `.env` file with database credentials.

### "No executable blocks found"
Ensure your code blocks use `` ```ts:run `` not `` ```typescript `` or `` ```ts ``.

### Test passes locally but fails in CI
Check that seed data values match what your example expects.

### "Column does not exist"
Verify you're using the correct column names from the `transactions` schema:
- `id`, `account`, `amount`, `description`, `createdAt`

### Results are encrypted/unreadable
For manual encryption pattern (`drizzle-protect.md`), ensure you call `bulkDecryptModels()`:
```typescript
const results = await db.select().from(transactions)
const decrypted = await encryptionClient.bulkDecryptModels(results)
return decrypted.data  // Not results!
```

## CI Integration

The documentation drift tests run as part of the standard test suite in CI (`.github/workflows/tests.yml`).

Tests fail when:
- Documentation files are missing
- Documentation has no `ts:run` blocks
- Any code block throws an error

## Architecture Decisions

### Why Execute Real Code?

Static analysis can't catch:
- Runtime API changes
- Database schema mismatches
- Encryption/decryption errors
- Query result format changes

Executing real code against a real database catches all of these.

### Why Property-Based Tests for the Parser?

The markdown parser uses fast-check for property-based testing to verify:
- Parsing is deterministic (same input → same output)
- All extracted blocks have valid structure
- Block count never exceeds fence count
- Unicode in section names is handled correctly
- No blocks are lost during parsing

This provides stronger guarantees than example-based tests alone.

### Why Relative Dates?

Hardcoded dates create time bombs - tests pass today but fail tomorrow. Relative dates (`daysAgo()`) ensure seed data and documentation examples stay synchronized regardless of when tests run.
