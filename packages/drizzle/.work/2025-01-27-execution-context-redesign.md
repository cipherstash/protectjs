# ExecutionContext Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use cipherpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate ExecutionContext for each documentation pattern to validate docs use only their intended operators.

**Architecture:** Create distinct contexts - `drizzle-protect.md` gets vanilla drizzle-orm (no `protect`), `drizzle.md` gets `protect` operators plus drizzle-orm. Spread `drizzle-orm` module instead of listing individual functions.

**Tech Stack:** TypeScript, Vitest, drizzle-orm

---

### Task 1: Update ExecutionContext Interface

**Files:**
- Modify: `packages/drizzle/__tests__/utils/code-executor.ts`

**Step 1: Read current interface**

Review existing `ExecutionContext` interface to understand current shape.

**Step 2: Update interface to be minimal**

Replace the explicit operator properties with index signature only:

```typescript
export interface ExecutionContext {
  [key: string]: unknown
}
```

**Step 3: Run existing tests to verify no breakage**

Run: `pnpm test code-executor`
Expected: PASS (interface is looser, existing code still works)

**Step 4: Commit**

```bash
git add packages/drizzle/__tests__/utils/code-executor.ts
git commit -m "refactor: simplify ExecutionContext interface to index signature"
```

---

### Task 2: Import drizzle-orm as namespace

**Files:**
- Modify: `packages/drizzle/__tests__/docs.test.ts:6-17`

**Step 1: Replace individual imports with namespace import**

Change:
```typescript
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
```

To:
```typescript
import * as drizzleOrm from 'drizzle-orm'
```

**Step 2: Run tests to verify import works**

Run: `pnpm test docs`
Expected: FAIL (contexts not yet updated)

**Step 3: Commit**

```bash
git add packages/drizzle/__tests__/docs.test.ts
git commit -m "refactor: import drizzle-orm as namespace module"
```

---

### Task 3: Create separate context for drizzle.md (Protect Operators Pattern)

**Files:**
- Modify: `packages/drizzle/__tests__/docs.test.ts:149-165`

**Step 1: Update drizzle.md context with spread**

Replace the explicit operator list:
```typescript
const context: ExecutionContext = {
  db,
  transactions,
  protect: protectOps,
  protectClient,
  protectTransactions,
  ...drizzleOrm,
}
```

**Step 2: Run drizzle.md tests**

Run: `pnpm test docs -- --grep "drizzle.md"`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/drizzle/__tests__/docs.test.ts
git commit -m "refactor: use spread drizzle-orm for protect operators context"
```

---

### Task 4: Create separate context for drizzle-protect.md (Manual Encryption Pattern)

**Files:**
- Modify: `packages/drizzle/__tests__/docs.test.ts:195-211`

**Step 1: Update drizzle-protect.md context WITHOUT protect**

Replace with spread but NO protect operators:
```typescript
const context: ExecutionContext = {
  db,
  transactions,
  protectClient,
  protectTransactions,
  ...drizzleOrm,
  // Note: 'protect' intentionally omitted
}
```

**Step 2: Run drizzle-protect.md tests**

Run: `pnpm test docs -- --grep "drizzle-protect.md"`
Expected: PASS (docs use vanilla operators correctly)

**Step 3: Commit**

```bash
git add packages/drizzle/__tests__/docs.test.ts
git commit -m "refactor: use spread drizzle-orm without protect for manual encryption context"
```

---

### Task 5: Verify test isolation

**Step 1: Run full test suite**

Run: `pnpm test docs`
Expected: All tests PASS

**Step 2: Verify drizzle-protect.md would fail if it used protect operators**

Manually check: If any `drizzle-protect.md` example used `protect.eq()`, it would now fail with "protect is not defined".

**Step 3: Final commit with verification**

```bash
git add -A
git commit -m "test: verify ExecutionContext isolation between doc patterns"
```

---

## Verification Checklist

- [ ] `ExecutionContext` interface simplified
- [ ] drizzle-orm imported as namespace
- [ ] drizzle.md tests pass with `protect` + spread drizzle-orm
- [ ] drizzle-protect.md tests pass with spread drizzle-orm only (no `protect`)
- [ ] Using `protect.eq()` in drizzle-protect.md would cause test failure
