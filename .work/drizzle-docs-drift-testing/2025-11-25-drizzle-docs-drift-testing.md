# Drizzle Documentation Drift Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use cipherpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create test infrastructure that executes code examples from drizzle documentation markdown files, failing CI if any example breaks.

**Architecture:** Simple markdown parser extracts `ts:run` code blocks, `Function()` constructor executes them in a controlled context with database access, vitest runs each block as a separate test case.

**Tech Stack:** TypeScript, vitest (existing), drizzle-orm (existing), @cipherstash/protect (existing), postgres-js (existing)

---

## Test Isolation & Data Safety

**How test execution avoids polluting production state:**

1. **Dedicated test table:** Tests use `drizzle-docs-test` table, completely separate from any production tables
2. **ID-based cleanup:** `beforeAll` stores inserted row IDs; `afterAll` deletes only those specific rows
3. **No shared state between test suites:** Each describe block reads its own documentation file independently
4. **No mutation of documentation files:** Tests only read markdown files, never write to them
5. **Database connection isolation:** Each test run creates its own postgres client connection

**Failure scenarios and cleanup guarantees:**
- If `beforeAll` fails during seeding → partial rows may exist, cleanup uses table-based deletion as fallback
- If tests fail mid-execution → `afterAll` still runs, cleaning up seeded data
- If `afterAll` fails → orphaned test rows remain but are identifiable by table name

**Partial failure cleanup strategy:**

The `beforeAll` seeding uses a two-phase approach:
1. **Track inserted IDs:** Each successful insert adds its ID to `seedDataIds` array
2. **Fallback cleanup:** If `seedDataIds` is empty but table has test data, `afterAll` deletes all rows from the test table

This ensures cleanup works even when:
- Bulk insert fails partway through (some rows inserted, some not)
- An error occurs between encryption and insertion
- The test process crashes and restarts

```typescript
// In afterAll:
if (seedDataIds.length > 0) {
  // Primary: delete only our seeded rows by ID
  await db.delete(transactions).where(inArray(transactions.id, seedDataIds))
} else {
  // Fallback: delete all rows from test table (safe - it's test-only)
  await db.delete(transactions)
}
```

---

## Error Handling Strategy

**Strict mode for CI (`DOCS_DRIFT_STRICT=true`):**

When `DOCS_DRIFT_STRICT` environment variable is set to `true`:
- Missing documentation files cause test failure (not skip)
- Missing DATABASE_URL causes immediate failure with clear error
- Zero executable blocks in a doc file causes test failure

**Development mode (default):**
- Missing documentation files log warning and skip tests
- Allows iterative development before docs are complete

This ensures CI catches drift while allowing local development flexibility.

**Database connection failure handling:**

The test suite validates database connectivity before attempting any operations:

1. **Missing DATABASE_URL:** Throws immediately with clear message before any tests run
2. **Invalid connection string:** Caught during `postgres()` client creation in `beforeAll`
3. **Database unreachable:** Caught during first query attempt with connection timeout
4. **Connection drops mid-test:** Individual test fails with connection error; `afterAll` attempts cleanup

Error messages include:
- The specific operation that failed (connect, seed, query, cleanup)
- The underlying database error
- Suggested remediation steps

---

## Pre-requisites

- Documentation already copied to `docs/reference/drizzle/drizzle.md` and `docs/reference/drizzle/drizzle-protect.md`
- Existing test patterns in `packages/drizzle/__tests__/drizzle.test.ts`

---

### Task 1: Create Test Utils Directory Structure

**Files:**
- Create: `packages/drizzle/__tests__/utils/` directory
- Create: `packages/drizzle/__tests__/fixtures/` directory

**Step 1: Create directories**

```bash
mkdir -p packages/drizzle/__tests__/utils
mkdir -p packages/drizzle/__tests__/fixtures
```

**Step 2: Verify directories exist**

Run: `ls -la packages/drizzle/__tests__/`
Expected: Should show `utils/` and `fixtures/` directories

**Step 3: Commit**

```bash
git add packages/drizzle/__tests__/utils packages/drizzle/__tests__/fixtures
git commit -m "chore(drizzle): add test utils and fixtures directories"
```

---

### Task 2: Create Markdown Parser Utility

**Files:**
- Create: `packages/drizzle/__tests__/utils/markdown-parser.ts`

**Step 1: Write the failing test**

Create `packages/drizzle/__tests__/utils/markdown-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { extractExecutableBlocks } from './markdown-parser'

describe('extractExecutableBlocks', () => {
  it('extracts ts:run code blocks', () => {
    const markdown = `# Test
## Section One

\`\`\`ts:run
const x = 1
return x
\`\`\`
`
    const blocks = extractExecutableBlocks(markdown)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].code).toBe('const x = 1\nreturn x')
    expect(blocks[0].section).toBe('Section One')
  })

  it('ignores non-executable code blocks', () => {
    const markdown = `# Test

\`\`\`typescript
const ignored = true
\`\`\`

\`\`\`ts:run
return 'executed'
\`\`\`
`
    const blocks = extractExecutableBlocks(markdown)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].code).toBe("return 'executed'")
  })

  it('tracks line numbers', () => {
    const markdown = `# Header

Some text

\`\`\`ts:run
return 1
\`\`\`
`
    const blocks = extractExecutableBlocks(markdown)

    expect(blocks[0].lineNumber).toBe(6)
  })

  it('extracts multiple blocks with unique IDs', () => {
    const markdown = `# Test
## First

\`\`\`ts:run
return 1
\`\`\`

## Second

\`\`\`ts:run
return 2
\`\`\`
`
    const blocks = extractExecutableBlocks(markdown)

    expect(blocks).toHaveLength(2)
    expect(blocks[0].id).not.toBe(blocks[1].id)
    expect(blocks[0].section).toBe('First')
    expect(blocks[1].section).toBe('Second')
  })

  // Edge cases for robustness
  describe('edge cases', () => {
    it('handles consecutive code blocks without headers', () => {
      const markdown = `## Section

\`\`\`ts:run
return 1
\`\`\`

\`\`\`ts:run
return 2
\`\`\`
`
      const blocks = extractExecutableBlocks(markdown)

      expect(blocks).toHaveLength(2)
      expect(blocks[0].section).toBe('Section')
      expect(blocks[1].section).toBe('Section') // Same section for both
    })

    it('handles empty code blocks', () => {
      const markdown = `## Section

\`\`\`ts:run
\`\`\`
`
      const blocks = extractExecutableBlocks(markdown)

      expect(blocks).toHaveLength(1)
      expect(blocks[0].code).toBe('')
    })

    it('handles code block at start of file', () => {
      const markdown = `\`\`\`ts:run
return 'first'
\`\`\`
`
      const blocks = extractExecutableBlocks(markdown)

      expect(blocks).toHaveLength(1)
      expect(blocks[0].section).toBe('Introduction') // Default section
    })

    it('handles code block at end of file without trailing newline', () => {
      const markdown = `## Section

\`\`\`ts:run
return 'last'
\`\`\``
      const blocks = extractExecutableBlocks(markdown)

      // Note: This edge case may not be handled - document expected behavior
      // Implementation may need adjustment if this fails
      expect(blocks).toHaveLength(1)
      expect(blocks[0].code).toBe("return 'last'")
    })

    it('ignores malformed blocks (no closing fence)', () => {
      const markdown = `## Section

\`\`\`ts:run
return 'unclosed'

## Next Section

Some text
`
      const blocks = extractExecutableBlocks(markdown)

      // Malformed block should be ignored, not cause errors
      expect(blocks).toHaveLength(0)
    })

    it('handles duplicate section names', () => {
      const markdown = `## Setup

\`\`\`ts:run
return 1
\`\`\`

## Setup

\`\`\`ts:run
return 2
\`\`\`
`
      const blocks = extractExecutableBlocks(markdown)

      expect(blocks).toHaveLength(2)
      expect(blocks[0].section).toBe('Setup')
      expect(blocks[1].section).toBe('Setup')
      expect(blocks[0].id).not.toBe(blocks[1].id) // IDs still unique
    })

    it('handles deeply nested headers', () => {
      const markdown = `# H1
## H2
### H3

\`\`\`ts:run
return 'nested'
\`\`\`
`
      const blocks = extractExecutableBlocks(markdown)

      expect(blocks).toHaveLength(1)
      expect(blocks[0].section).toBe('H3') // Most recent header
    })

    it('handles code blocks with extra whitespace in fence', () => {
      const markdown = `## Section

\`\`\`ts:run
return 'whitespace'
\`\`\`
`
      const blocks = extractExecutableBlocks(markdown)

      // Trailing whitespace in fence should still match
      expect(blocks).toHaveLength(1)
    })
  })

  // Property-based tests using fast-check
  describe('property-based tests', () => {
    // Note: Requires `pnpm add -D fast-check` in packages/drizzle
    // These tests verify invariants that should hold for ANY valid input

    it('parsing is deterministic - same input always produces same output', () => {
      fc.assert(
        fc.property(fc.string(), (randomContent) => {
          const markdown = `## Section\n\n\`\`\`ts:run\n${randomContent}\n\`\`\`\n`
          const result1 = extractExecutableBlocks(markdown)
          const result2 = extractExecutableBlocks(markdown)

          expect(result1).toEqual(result2)
        }),
        { numRuns: 100 }
      )
    })

    it('extracted blocks always have valid structure', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({
            section: fc.string({ minLength: 1 }),
            code: fc.string(),
          }), { minLength: 0, maxLength: 5 }),
          (blocks) => {
            // Generate markdown from blocks
            const markdown = blocks.map(b =>
              `## ${b.section}\n\n\`\`\`ts:run\n${b.code}\n\`\`\`\n`
            ).join('\n')

            const result = extractExecutableBlocks(markdown)

            // Every extracted block must have required properties
            for (const block of result) {
              expect(block).toHaveProperty('id')
              expect(block).toHaveProperty('code')
              expect(block).toHaveProperty('section')
              expect(block).toHaveProperty('lineNumber')
              expect(typeof block.id).toBe('string')
              expect(typeof block.code).toBe('string')
              expect(typeof block.section).toBe('string')
              expect(typeof block.lineNumber).toBe('number')
              expect(block.lineNumber).toBeGreaterThan(0)
            }
          }
        ),
        { numRuns: 50 }
      )
    })

    it('block count never exceeds fence pair count', () => {
      fc.assert(
        fc.property(fc.string(), (randomMarkdown) => {
          const fenceCount = (randomMarkdown.match(/```ts:run/g) || []).length
          const result = extractExecutableBlocks(randomMarkdown)

          // Can't extract more blocks than opening fences
          expect(result.length).toBeLessThanOrEqual(fenceCount)
        }),
        { numRuns: 100 }
      )
    })

    it('handles unicode in section names', () => {
      fc.assert(
        fc.property(
          fc.unicodeString({ minLength: 1, maxLength: 50 }),
          (unicodeSection) => {
            // Filter out characters that would break markdown structure
            const safeSection = unicodeSection.replace(/[#\n\r`]/g, '')
            if (!safeSection) return true // Skip empty after filtering

            const markdown = `## ${safeSection}\n\n\`\`\`ts:run\nreturn 1\n\`\`\`\n`
            const result = extractExecutableBlocks(markdown)

            expect(result).toHaveLength(1)
            expect(result[0].section).toBe(safeSection)
          }
        ),
        { numRuns: 50 }
      )
    })

    it('no blocks lost during parsing - all valid blocks extracted', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (blockCount) => {
            // Generate exactly N well-formed blocks
            const markdown = Array.from({ length: blockCount }, (_, i) =>
              `## Section${i}\n\n\`\`\`ts:run\nreturn ${i}\n\`\`\`\n`
            ).join('\n')

            const result = extractExecutableBlocks(markdown)

            // All well-formed blocks should be extracted
            expect(result).toHaveLength(blockCount)
          }
        ),
        { numRuns: 20 }
      )
    })
  })
})
```

**Step 1.5: Install fast-check dependency**

Run: `cd packages/drizzle && pnpm add -D fast-check`

**Step 1.6: Add fast-check import to test file**

Add at top of `packages/drizzle/__tests__/utils/markdown-parser.test.ts`:

```typescript
import * as fc from 'fast-check'
```

**Step 2: Run test to verify it fails**

Run: `cd packages/drizzle && pnpm test utils/markdown-parser.test.ts`
Expected: FAIL - Cannot find module './markdown-parser'

**Step 3: Write minimal implementation**

Create `packages/drizzle/__tests__/utils/markdown-parser.ts`:

```typescript
export interface CodeBlock {
  id: string
  code: string
  section: string
  lineNumber: number
}

/**
 * Extract executable code blocks from markdown.
 * Looks for ```ts:run fenced code blocks.
 */
export function extractExecutableBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const lines = markdown.split('\n')

  let currentSection = 'Introduction'
  let inCodeBlock = false
  let currentCode: string[] = []
  let blockStartLine = 0
  let blockId = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track section headers (## or ### level)
    const headerMatch = line.match(/^#{1,3}\s+(.+)$/)
    if (headerMatch) {
      currentSection = headerMatch[1]
    }

    // Start of executable code block
    if (line.match(/^```ts:run\s*$/)) {
      inCodeBlock = true
      currentCode = []
      blockStartLine = i + 2 // 1-indexed, next line is code start
      continue
    }

    // End of code block
    if (inCodeBlock && line === '```') {
      blocks.push({
        id: `block-${blockId++}`,
        code: currentCode.join('\n'),
        section: currentSection,
        lineNumber: blockStartLine,
      })
      inCodeBlock = false
      continue
    }

    // Accumulate code
    if (inCodeBlock) {
      currentCode.push(line)
    }
  }

  return blocks
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/drizzle && pnpm test utils/markdown-parser.test.ts`
Expected: PASS - 4 tests pass

**Step 5: Commit**

```bash
git add packages/drizzle/__tests__/utils/markdown-parser.ts packages/drizzle/__tests__/utils/markdown-parser.test.ts
git commit -m "feat(drizzle): add markdown parser for extracting :run code blocks"
```

---

### Task 3: Create Code Executor Utility

**Files:**
- Create: `packages/drizzle/__tests__/utils/code-executor.ts`

**Step 1: Write the failing test**

Create `packages/drizzle/__tests__/utils/code-executor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { executeCodeBlock, type ExecutionContext } from './code-executor'

describe('executeCodeBlock', () => {
  const mockContext: ExecutionContext = {
    db: {},
    transactions: {},
    protect: {},
    protectClient: {},
    protectTransactions: {},
    eq: () => {},
    gte: () => {},
    lte: () => {},
    ilike: () => {},
    and: () => {},
    or: () => {},
    desc: () => {},
    asc: () => {},
    sql: () => {},
    inArray: () => {},
  }

  it('executes simple code and returns result', async () => {
    const code = 'return 1 + 1'
    const result = await executeCodeBlock(code, mockContext)

    expect(result.success).toBe(true)
    expect(result.result).toBe(2)
  })

  it('provides context variables to code', async () => {
    const contextWithValue = { ...mockContext, testValue: 42 }
    const code = 'return testValue'
    const result = await executeCodeBlock(code, contextWithValue as ExecutionContext)

    expect(result.success).toBe(true)
    expect(result.result).toBe(42)
  })

  it('handles async code', async () => {
    const code = 'return await Promise.resolve("async result")'
    const result = await executeCodeBlock(code, mockContext)

    expect(result.success).toBe(true)
    expect(result.result).toBe('async result')
  })

  it('captures errors', async () => {
    const code = 'throw new Error("test error")'
    const result = await executeCodeBlock(code, mockContext)

    expect(result.success).toBe(false)
    expect(result.error).toContain('test error')
  })

  it('handles syntax errors', async () => {
    const code = 'return {'  // Invalid syntax
    const result = await executeCodeBlock(code, mockContext)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/drizzle && pnpm test utils/code-executor.test.ts`
Expected: FAIL - Cannot find module './code-executor'

**Step 3: Write minimal implementation**

Create `packages/drizzle/__tests__/utils/code-executor.ts`:

```typescript
export interface ExecutionContext {
  db: unknown
  transactions: unknown
  protect: unknown
  protectClient: unknown
  protectTransactions: unknown
  eq: unknown
  gte: unknown
  lte: unknown
  ilike: unknown
  and: unknown
  or: unknown
  desc: unknown
  asc: unknown
  sql: unknown
  inArray: unknown
  [key: string]: unknown
}

export interface ExecutionResult {
  success: boolean
  result?: unknown
  error?: string
}

/**
 * Execute a documentation code block in a controlled context.
 *
 * ## Security Considerations
 *
 * This function uses the `Function()` constructor to execute arbitrary code.
 * This is equivalent to `eval()` and would normally be a serious security risk.
 *
 * **Why it's safe in this context:**
 * 1. **Trusted source:** Code comes only from our own documentation files in the
 *    repository, not from user input or external sources.
 * 2. **Code review:** All documentation code examples go through PR review before
 *    being merged, same as production code.
 * 3. **No network exposure:** Tests run in CI or local dev, never in production
 *    environments handling user requests.
 * 4. **Controlled context:** Executed code only has access to explicitly provided
 *    context variables (db, operators), not global scope or filesystem.
 *
 * **When this would NOT be safe:**
 * - If code came from user input (web forms, API requests)
 * - If code came from external/untrusted sources
 * - If executed in a production environment
 * - If the execution context included sensitive globals
 *
 * The eslint-disable comment below acknowledges we've considered the security
 * implications and determined this usage is appropriate for the use case.
 */
export async function executeCodeBlock(
  code: string,
  context: ExecutionContext,
): Promise<ExecutionResult> {
  try {
    // Create an async function with access to context variables
    const contextKeys = Object.keys(context)
    const contextValues = Object.values(context)

    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const asyncFn = new Function(
      ...contextKeys,
      `return (async () => { ${code} })()`,
    )

    const result = await asyncFn(...contextValues)

    return {
      success: true,
      result,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/drizzle && pnpm test utils/code-executor.test.ts`
Expected: PASS - 5 tests pass

**Step 5: Commit**

```bash
git add packages/drizzle/__tests__/utils/code-executor.ts packages/drizzle/__tests__/utils/code-executor.test.ts
git commit -m "feat(drizzle): add code executor for documentation examples"
```

---

### Task 4: Create Seed Data Fixture

**Files:**
- Create: `packages/drizzle/__tests__/fixtures/doc-seed-data.ts`

**Step 1: Create seed data file (no test needed - it's just data)**

Create `packages/drizzle/__tests__/fixtures/doc-seed-data.ts`:

```typescript
/**
 * Seed data for documentation examples.
 * This data matches the examples in docs/reference/drizzle/*.md
 *
 * ## Date Strategy
 * Uses relative dates (days before test run) to ensure tests remain valid
 * regardless of when they're executed. Documentation examples use relative
 * concepts like "recent transactions" rather than specific dates.
 *
 * ## Seed Data to Documentation Section Mapping
 *
 * | Record | Account | Amount | Description | Used In |
 * |--------|---------|--------|-------------|---------|
 * | 0 | 1234567890 | 800.00 | Salary deposit | drizzle.md: "Equality Matching", "Combined Queries" |
 * | 1 | 0987654321 | 150.00 | Gym membership | drizzle.md: "Free Text Search" (ilike 'gym') |
 * | 2 | 1234567890 | 1250.00 | Rent payment | drizzle.md: "Range Queries" (amount > 1000) |
 * | 3-11 | various | various | various | drizzle.md: "Ordering Results", pagination examples |
 * | 12 | 1010101010 | 60.00 | Gym supplements | drizzle.md: "Free Text Search" (second gym match) |
 * | 13 | 1212121212 | 2000.00 | Bonus deposit | drizzle.md: "Range Queries" (high amount) |
 * | 14 | 1313131313 | 35.00 | Book purchase | drizzle.md: "Range Queries" (low amount) |
 *
 * ## Maintenance
 * When updating documentation examples:
 * 1. Check which seed records the example depends on (see mapping above)
 * 2. Update seed data if new values are needed
 * 3. Update the mapping table to reflect changes
 * 4. Run tests to verify examples still work
 */

// Helper to create dates relative to test execution
function daysAgo(days: number): number {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(10, 0, 0, 0) // Normalize to 10:00 UTC
  return date.getTime()
}

export const docSeedData = [
  {
    account: '1234567890',
    amount: 800.0,
    description: 'Salary deposit',
    createdAt: daysAgo(10), // ~10 days ago
  },
  {
    account: '0987654321',
    amount: 150.0,
    description: 'Gym membership payment',
    createdAt: daysAgo(13), // ~13 days ago
  },
  {
    account: '1234567890',
    amount: 1250.0,
    description: 'Rent payment',
    createdAt: daysAgo(5), // ~5 days ago
  },
  {
    account: '5555555555',
    amount: 75.0,
    description: 'Coffee subscription',
    createdAt: daysAgo(7), // ~7 days ago
  },
  {
    account: '1111111111',
    amount: 200.0,
    description: 'Internet payment',
    createdAt: daysAgo(11), // ~11 days ago
  },
  {
    account: '2222222222',
    amount: 50.0,
    description: 'Streaming service',
    createdAt: daysAgo(9), // ~9 days ago
  },
  {
    account: '3333333333',
    amount: 1500.0,
    description: 'Car payment',
    createdAt: daysAgo(3), // ~3 days ago
  },
  {
    account: '4444444444',
    amount: 300.0,
    description: 'Insurance payment',
    createdAt: daysAgo(14), // ~14 days ago
  },
  {
    account: '6666666666',
    amount: 25.0,
    description: 'App subscription',
    createdAt: daysAgo(2), // ~2 days ago
  },
  {
    account: '7777777777',
    amount: 500.0,
    description: 'Utility payment',
    createdAt: daysAgo(6), // ~6 days ago
  },
  {
    account: '8888888888',
    amount: 100.0,
    description: 'Phone payment',
    createdAt: daysAgo(12), // ~12 days ago
  },
  {
    account: '9999999999',
    amount: 450.0,
    description: 'Grocery payment',
    createdAt: daysAgo(8), // ~8 days ago
  },
  {
    account: '1010101010',
    amount: 60.0,
    description: 'Gym supplements',
    createdAt: daysAgo(1), // ~1 day ago
  },
  {
    account: '1212121212',
    amount: 2000.0,
    description: 'Bonus deposit',
    createdAt: daysAgo(4), // ~4 days ago
  },
  {
    account: '1313131313',
    amount: 35.0,
    description: 'Book purchase',
    createdAt: daysAgo(15), // ~15 days ago (oldest)
  },
]
```

**Step 2: Verify file syntax**

Run: `cd packages/drizzle && npx tsc --noEmit __tests__/fixtures/doc-seed-data.ts 2>&1 || echo "TypeScript check complete"`
Expected: No errors (or "TypeScript check complete")

**Step 3: Commit**

```bash
git add packages/drizzle/__tests__/fixtures/doc-seed-data.ts
git commit -m "feat(drizzle): add seed data fixture for documentation tests"
```

---

### Task 5: Create Documentation Drift Test Suite

**Files:**
- Create: `packages/drizzle/__tests__/docs.test.ts`

**Step 1: Create the test file**

Create `packages/drizzle/__tests__/docs.test.ts`:

```typescript
import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { protect } from '@cipherstash/protect'
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import { integer, pgTable } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createProtectOperators,
  encryptedType,
  extractProtectSchema,
} from '../src/pg'
import { docSeedData } from './fixtures/doc-seed-data'
import {
  executeCodeBlock,
  type ExecutionContext,
} from './utils/code-executor'
import { extractExecutableBlocks } from './utils/markdown-parser'

// Strict mode for CI - fails instead of skipping when docs are missing
const STRICT_MODE = process.env.DOCS_DRIFT_STRICT === 'true'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing env.DATABASE_URL')
}

/**
 * Load documentation file with strict mode support.
 * In strict mode (CI), missing files cause test failure.
 * In development mode, missing files are skipped with a warning.
 */
function loadDocumentation(docsPath: string, docName: string) {
  if (!existsSync(docsPath)) {
    if (STRICT_MODE) {
      throw new Error(
        `[STRICT MODE] Documentation file not found: ${docsPath}\n` +
        `Expected documentation at: ${docName}\n` +
        `Set DOCS_DRIFT_STRICT=false to skip missing docs during development.`
      )
    }
    console.warn(`[DEV MODE] Skipping missing documentation: ${docsPath}`)
    return { blocks: [], skipped: true }
  }

  const markdown = readFileSync(docsPath, 'utf-8')
  const blocks = extractExecutableBlocks(markdown)

  if (blocks.length === 0 && STRICT_MODE) {
    throw new Error(
      `[STRICT MODE] No executable blocks found in: ${docsPath}\n` +
      `Expected \`\`\`ts:run code blocks in documentation.`
    )
  }

  return { blocks, skipped: false }
}

// Table schema matching documentation examples
const transactions = pgTable('drizzle-docs-test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  account: encryptedType<string>('account_number', {
    equality: true,
  }),
  amount: encryptedType<number>('amount', {
    dataType: 'number',
    equality: true,
    orderAndRange: true,
  }),
  description: encryptedType<string>('description', {
    freeTextSearch: true,
    equality: true,
  }),
  createdAt: encryptedType<number>('created_at', {
    dataType: 'number',
    orderAndRange: true,
  }),
})

const protectTransactions = extractProtectSchema(transactions)

describe('Documentation Drift Tests', () => {
  let db: ReturnType<typeof drizzle>
  let client: ReturnType<typeof postgres>
  let protectClient: Awaited<ReturnType<typeof protect>>
  let protectOps: ReturnType<typeof createProtectOperators>
  let seedDataIds: number[] = []

  beforeAll(async () => {
    client = postgres(process.env.DATABASE_URL as string)
    db = drizzle({ client })
    protectClient = await protect({ schemas: [protectTransactions] })
    protectOps = createProtectOperators(protectClient)

    // Seed test data
    const encrypted = await protectClient.bulkEncryptModels(
      docSeedData,
      protectTransactions,
    )
    if (encrypted.failure) {
      throw new Error(`Encryption failed: ${encrypted.failure.message}`)
    }

    const inserted = await db
      .insert(transactions)
      .values(encrypted.data)
      .returning({ id: transactions.id })
    seedDataIds = inserted.map((r) => r.id)
  }, 120000)

  afterAll(async () => {
    try {
      if (seedDataIds.length > 0) {
        // Primary: delete only our seeded rows by ID
        await db.delete(transactions).where(inArray(transactions.id, seedDataIds))
      } else {
        // Fallback: delete all rows from test table (safe - it's test-only)
        // This handles partial failures during seeding
        await db.delete(transactions)
      }
    } catch (cleanupError) {
      console.error('[CLEANUP ERROR] Failed to clean up test data:', cleanupError)
      // Don't throw - allow test results to be reported even if cleanup fails
    } finally {
      await client.end()
    }
  }, 30000)

  describe('drizzle.md - Protect Operators Pattern', () => {
    // Path to documentation relative to repo root
    const docsPath = join(
      __dirname,
      '../../../docs/reference/drizzle/drizzle.md',
    )

    const { blocks, skipped } = loadDocumentation(docsPath, 'drizzle.md')

    if (skipped || blocks.length === 0) {
      it.skip('No executable blocks found in drizzle.md', () => {})
    } else {
      it.each(blocks.map((b) => [b.section, b]))(
        '%s',
        async (_section, block) => {
          const context: ExecutionContext = {
            db,
            transactions,
            protect: protectOps,
            protectClient,
            protectTransactions,
            eq,
            gte,
            lte,
            ilike,
            and,
            or,
            desc,
            asc,
            sql,
            inArray,
          }

          const result = await executeCodeBlock(block.code, context)

          if (!result.success) {
            console.error(`\nFailed block at line ${block.lineNumber}:`)
            console.error('---')
            console.error(block.code)
            console.error('---')
            console.error(`Error: ${result.error}`)
          }

          expect(result.success, `Block failed: ${result.error}`).toBe(true)
          expect(result.result).toBeDefined()
        },
        30000,
      )
    }
  })

  describe('drizzle-protect.md - Manual Encryption Pattern', () => {
    const docsPath = join(
      __dirname,
      '../../../docs/reference/drizzle/drizzle-protect.md',
    )

    const { blocks, skipped } = loadDocumentation(docsPath, 'drizzle-protect.md')

    if (skipped || blocks.length === 0) {
      it.skip('No executable blocks found in drizzle-protect.md', () => {})
    } else {
      it.each(blocks.map((b) => [b.section, b]))(
        '%s',
        async (_section, block) => {
          const context: ExecutionContext = {
            db,
            transactions,
            protect: protectOps,
            protectClient,
            protectTransactions,
            eq,
            gte,
            lte,
            ilike,
            and,
            or,
            desc,
            asc,
            sql,
            inArray,
          }

          const result = await executeCodeBlock(block.code, context)

          if (!result.success) {
            console.error(`\nFailed block at line ${block.lineNumber}:`)
            console.error('---')
            console.error(block.code)
            console.error('---')
            console.error(`Error: ${result.error}`)
          }

          expect(result.success, `Block failed: ${result.error}`).toBe(true)
          expect(result.result).toBeDefined()
        },
        30000,
      )
    }
  })
})
```

**Step 2: Run tests (expect some to fail - need live database)**

Run: `cd packages/drizzle && pnpm test docs.test.ts`
Expected: Tests will fail if DATABASE_URL not set, otherwise should attempt to run

**Step 3: Commit**

```bash
git add packages/drizzle/__tests__/docs.test.ts
git commit -m "feat(drizzle): add documentation drift detection test suite"
```

---

### Task 6: Update docs/README.md

**Files:**
- Modify: `docs/README.md`

**Step 1: Read current README**

Run: `cat docs/README.md`
Expected: Shows current content to understand structure

**Step 2: Add drizzle documentation reference**

Add to the Reference section in `docs/README.md`:

```markdown
### Drizzle ORM Integration

- [Protect Operators Pattern](reference/drizzle/drizzle.md) - Recommended approach with auto-encrypting operators
- [Manual Encryption Pattern](reference/drizzle/drizzle-protect.md) - Explicit control over encryption workflow
```

**Step 3: Commit**

```bash
git add docs/README.md
git commit -m "docs: add drizzle documentation to central docs index"
```

---

### Task 7: Add Documentation Files to Git

**Files:**
- Stage: `docs/reference/drizzle/drizzle.md`
- Stage: `docs/reference/drizzle/drizzle-protect.md`

**Step 1: Stage documentation files**

```bash
git add docs/reference/drizzle/drizzle.md docs/reference/drizzle/drizzle-protect.md
```

**Step 2: Commit**

```bash
git commit -m "docs(drizzle): add protect operators and manual encryption usage guides"
```

---

### Task 8: Run Full Test Suite

**Step 1: Ensure database is available**

Verify DATABASE_URL is set and database is accessible.

**Step 2: Run all drizzle tests**

Run: `cd packages/drizzle && pnpm test`
Expected: All tests pass including new docs.test.ts

**Step 3: If tests fail, debug**

Check:
- DATABASE_URL environment variable
- Seed data matches documentation examples
- Code blocks in markdown are syntactically valid

---

### Task 9: Configure CI for Documentation Drift Detection

**Files:**
- Modify: `.github/workflows/ci.yml` (or create if doesn't exist)

**Step 1: Identify existing CI workflow**

Run: `ls -la .github/workflows/`
Expected: Shows existing workflow files (e.g., `ci.yml`, `test.yml`, `main.yml`)

**Step 2: Read existing workflow to understand structure**

Run: `cat .github/workflows/ci.yml` (or the primary test workflow)
Expected: Shows current job configuration for tests

**Step 3: Add DOCS_DRIFT_STRICT environment variable**

Add the following to the test job that runs drizzle tests:

```yaml
# In the job that runs drizzle package tests
jobs:
  test:
    # ... existing configuration ...
    env:
      # Existing env vars...
      DOCS_DRIFT_STRICT: 'true'  # Fail CI if documentation examples are missing or broken
```

**Alternative: If tests run in a matrix or separate job for drizzle:**

```yaml
jobs:
  test-drizzle:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      DOCS_DRIFT_STRICT: 'true'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: cd packages/drizzle && pnpm test
```

**Step 4: Verify CI configuration syntax**

Run: `cat .github/workflows/ci.yml | head -50`
Expected: YAML is valid, env section includes DOCS_DRIFT_STRICT

**Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: enable strict documentation drift detection in CI"
```

**Step 6: Verify CI enforcement (after merge)**

After merging, verify that:
1. CI runs documentation drift tests
2. If docs are missing, CI fails with `[STRICT MODE]` error message
3. If docs have broken examples, CI fails with specific block/line info

---

## Verification Checklist

After completing all tasks:

### File Existence
- [ ] `docs/reference/drizzle/drizzle.md` exists with 19 `:run` blocks
- [ ] `docs/reference/drizzle/drizzle-protect.md` exists with 22 `:run` blocks
- [ ] `packages/drizzle/__tests__/utils/markdown-parser.ts` extracts code blocks
- [ ] `packages/drizzle/__tests__/utils/code-executor.ts` executes code
- [ ] `packages/drizzle/__tests__/fixtures/doc-seed-data.ts` has 15 entries
- [ ] `packages/drizzle/__tests__/docs.test.ts` runs all 41 examples
- [ ] All tests pass with `pnpm test` in packages/drizzle
- [ ] `docs/README.md` references drizzle documentation

### CI Configuration
- [ ] `.github/workflows/ci.yml` (or equivalent) contains `DOCS_DRIFT_STRICT: 'true'`
- [ ] CI workflow runs drizzle package tests
- [ ] Property-based tests run in CI (fast-check installed)

### Error Scenario Validation

These scenarios MUST fail validation to confirm error handling works correctly:

**Environment errors (should fail immediately):**
```bash
# Missing DATABASE_URL - should throw "Missing env.DATABASE_URL"
unset DATABASE_URL && cd packages/drizzle && pnpm test docs.test.ts
# Expected: Error thrown before tests run
```

**Strict mode errors (should fail in CI):**
```bash
# Missing docs in strict mode - should throw "[STRICT MODE] Documentation file not found"
rm docs/reference/drizzle/drizzle.md
DOCS_DRIFT_STRICT=true pnpm test docs.test.ts
# Expected: Test failure with clear error message

# Empty docs in strict mode - should throw "[STRICT MODE] No executable blocks found"
echo "# Empty doc" > docs/reference/drizzle/drizzle.md
DOCS_DRIFT_STRICT=true pnpm test docs.test.ts
# Expected: Test failure with clear error message
```

**Development mode behavior (should skip gracefully):**
```bash
# Missing docs in dev mode - should skip with warning
rm docs/reference/drizzle/drizzle.md
DOCS_DRIFT_STRICT=false pnpm test docs.test.ts
# Expected: Tests skip with "[DEV MODE] Skipping missing documentation" warning
```

**Database errors (should fail with clear message):**
```bash
# Invalid DATABASE_URL - should fail during connection
DATABASE_URL=postgres://invalid:5432/bad pnpm test docs.test.ts
# Expected: Connection error during beforeAll

# Database unavailable - should fail during seed
# (stop postgres, then run tests)
# Expected: Connection/query error with stack trace
```

### CI Configuration

Add to CI workflow (`.github/workflows/test.yml` or equivalent):
```yaml
env:
  DOCS_DRIFT_STRICT: 'true'  # Fail CI if docs are missing or empty
```
