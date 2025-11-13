# Sequelize Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Sequelize ORM integration for Protect.js that provides transparent searchable encryption using hooks

**Architecture:** Hook-based transparent encryption where `beforeFind` encrypts WHERE clause values and `afterFind` decrypts results. Uses custom ENCRYPTED DataType that maps to PostgreSQL's `eql_v2_encrypted` composite type. EQL's operator classes make native operators (`=`, `>`, `LIKE`) work directly on encrypted data.

**Tech Stack:** TypeScript, Sequelize 6+, Protect.js, PostgreSQL, Vitest

---

## Task 1: Project Scaffolding

**Files:**
- Create: `packages/sequelize/package.json`
- Create: `packages/sequelize/tsconfig.json`
- Create: `packages/sequelize/tsup.config.ts`
- Create: `packages/sequelize/src/index.ts`
- Create: `packages/sequelize/src/types.ts`

**Step 1: Create package.json**

```json
{
  "name": "@cipherstash/sequelize",
  "version": "0.1.0",
  "description": "CipherStash Protect.js Sequelize ORM integration for TypeScript",
  "keywords": [
    "encrypted",
    "sequelize",
    "orm",
    "type-safe",
    "security",
    "protectjs",
    "postgres"
  ],
  "bugs": {
    "url": "https://github.com/cipherstash/protectjs/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/cipherstash/protectjs.git"
  },
  "license": "MIT",
  "author": "CipherStash <hello@cipherstash.com>",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "release": "tsup"
  },
  "peerDependencies": {
    "@cipherstash/protect": ">=10",
    "@cipherstash/schema": ">=1.1",
    "sequelize": ">=6.0.0"
  },
  "devDependencies": {
    "@cipherstash/protect": "workspace:*",
    "@cipherstash/schema": "workspace:*",
    "@types/node": "^20.0.0",
    "dotenv": "^16.4.7",
    "sequelize": "^6.37.0",
    "tsup": "catalog:repo",
    "typescript": "catalog:repo",
    "vitest": "catalog:repo"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
```

**Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  sourcemap: true,
  dts: true,
  clean: true,
})
```

**Step 4: Create src/types.ts with type definitions**

```typescript
import type { MatchIndexOpts, TokenFilter } from '@cipherstash/schema'

/**
 * Configuration for encrypted column indexes and data types
 * Note: columnName is passed separately to createEncryptedType(), not in this config object
 */
export interface EncryptedColumnConfig {
  /**
   * Data type for the column (default: 'string')
   */
  dataType?: 'string' | 'number' | 'json'

  /**
   * Enable equality index. Can be a boolean for default options, or an array of token filters.
   */
  equality?: boolean | TokenFilter[]

  /**
   * Enable free text search. Can be a boolean for default options, or an object for custom configuration.
   */
  freeTextSearch?: boolean | MatchIndexOpts

  /**
   * Enable order and range index for sorting and range queries.
   */
  orderAndRange?: boolean
}
```

**Step 5: Create src/index.ts as main export file**

```typescript
// Main exports (will be populated in later tasks)
export { createEncryptedType, getEncryptedColumnConfig } from './data-type'
export { addProtectHooks } from './hooks'
export { extractProtectSchema, extractProtectSchemas } from './schema-extraction'

// Type exports
export type { EncryptedColumnConfig } from './types'
```

**Step 6: Install dependencies**

Run: `cd packages/sequelize && pnpm install`

**Step 7: Create .npmignore**

Create `packages/sequelize/.npmignore`:

```
__tests__
*.test.ts
*.test.js
tsconfig.json
tsup.config.ts
.turbo
.DS_Store
node_modules
src
```

**Step 8: Commit**

```bash
git add packages/sequelize/
git commit -m "feat(sequelize): add project scaffolding and configuration"
```

---

## Task 2: Custom DataType - ENCRYPTED

**Files:**
- Create: `packages/sequelize/src/data-type.ts`
- Create: `packages/sequelize/__tests__/data-type.test.ts`

**Step 1: Write the failing test**

Create `packages/sequelize/__tests__/data-type.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createEncryptedType, getEncryptedColumnConfig } from '../src/data-type'

describe('createEncryptedType', () => {
  let ENCRYPTED: ReturnType<typeof createEncryptedType>

  beforeEach(() => {
    ENCRYPTED = createEncryptedType()
  })

  it('should create an ENCRYPTED data type', () => {
    const column = ENCRYPTED('email', { equality: true })
    expect(column).toBeDefined()
  })

  it('should store column config in registry', () => {
    ENCRYPTED('email', { equality: true, dataType: 'string' })

    const config = getEncryptedColumnConfig('email')
    expect(config).toBeDefined()
    expect(config?.columnName).toBe('email')
    expect(config?.equality).toBe(true)
    expect(config?.dataType).toBe('string')
  })

  it('should return SQL type as eql_v2_encrypted', () => {
    const column = ENCRYPTED('email', { equality: true })
    expect(column.toSql()).toBe('eql_v2_encrypted')
  })
})

describe('composite type parsing', () => {
  let ENCRYPTED: ReturnType<typeof createEncryptedType>

  beforeEach(() => {
    ENCRYPTED = createEncryptedType()
  })

  it('should parse composite type from database', () => {
    const EncryptedType = ENCRYPTED('test', {})
    const result = (EncryptedType.constructor as any).parse('("{\\"ciphertext\\":\\"data\\"}")')
    expect(result).toEqual({ ciphertext: 'data' })
  })

  it('should handle null values', () => {
    const EncryptedType = ENCRYPTED('test', {})
    const result = (EncryptedType.constructor as any).parse('')
    expect(result).toBe(null)
  })

  it('should serialize values to composite type format', () => {
    const EncryptedType = ENCRYPTED('test', {})
    const result = (EncryptedType.constructor as any).stringify({ ciphertext: 'data' })
    expect(result).toBe('("{\\"ciphertext\\":\\"data\\"}")')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/sequelize && pnpm test data-type`
Expected: FAIL with "Cannot find module '../src/data-type'"

**Step 3: Write minimal implementation**

Create `packages/sequelize/src/data-type.ts`:

```typescript
import { DataTypes } from 'sequelize'
import type { EncryptedColumnConfig } from './types'

/**
 * Registry to store encrypted column configurations
 * Keyed by column name for hook access
 */
const encryptedColumnRegistry = new Map<string, EncryptedColumnConfig>()

/**
 * Creates the ENCRYPTED data type factory for Sequelize
 *
 * Usage:
 *   const ENCRYPTED = createEncryptedType()
 *   User.init({
 *     email: { type: ENCRYPTED('email', { equality: true }) }
 *   })
 */
export function createEncryptedType() {
  /**
   * ENCRYPTED data type class that extends Sequelize ABSTRACT
   */
  class ENCRYPTED extends DataTypes.ABSTRACT {
    /**
     * Returns the SQL type for this column
     */
    toSql(): string {
      return 'eql_v2_encrypted'
    }

    /**
     * Parse composite type value from PostgreSQL: ("ciphertext")
     */
    static parse(value: string): any {
      if (!value || value === '') return null

      const trimmed = value.trim()

      if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
        let inner = trimmed.slice(1, -1)
        // Unescape double quotes
        inner = inner.replace(/""/g, '"')

        if (inner.startsWith('"') && inner.endsWith('"')) {
          const stripped = inner.slice(1, -1)
          return JSON.parse(stripped)
        }

        // Try parsing as JSON directly
        if (inner.startsWith('{') || inner.startsWith('[')) {
          return JSON.parse(inner)
        }

        return inner
      }

      return JSON.parse(value)
    }

    /**
     * Serialize value to composite type format for PostgreSQL: ("json_string")
     */
    static stringify(value: any): string {
      const jsonStr = JSON.stringify(value)
      const escaped = jsonStr.replace(/"/g, '""')
      return `("${escaped}")`
    }
  }

  /**
   * Factory function to create column with config
   */
  return function (
    columnName: string,
    config?: Omit<EncryptedColumnConfig, 'columnName'>
  ) {
    const instance = new ENCRYPTED()

    const fullConfig: EncryptedColumnConfig = {
      columnName,
      ...config,
    }

    // Store config in registry for hook access
    encryptedColumnRegistry.set(columnName, fullConfig)

    // Also attach to instance for immediate access
    ;(instance as any)._protectConfig = fullConfig

    return instance
  }
}

/**
 * Get configuration for an encrypted column by name
 * Used by hooks to determine how to handle encryption
 * Returns config with columnName included for convenience
 */
export function getEncryptedColumnConfig(
  columnName: string
): (EncryptedColumnConfig & { columnName: string }) | undefined {
  return encryptedColumnRegistry.get(columnName)
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/sequelize && pnpm test data-type`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sequelize/src/data-type.ts packages/sequelize/__tests__/data-type.test.ts
git commit -m "feat(sequelize): implement custom ENCRYPTED DataType with composite type support"
```

---

## Task 3: Schema Extraction

**Files:**
- Create: `packages/sequelize/src/schema-extraction.ts`
- Create: `packages/sequelize/__tests__/schema-extraction.test.ts`

**Step 1: Write the failing test**

Create `packages/sequelize/__tests__/schema-extraction.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { Sequelize, Model, DataTypes } from 'sequelize'
import { createEncryptedType } from '../src/data-type'
import { extractProtectSchema, extractProtectSchemas } from '../src/schema-extraction'

describe('extractProtectSchema', () => {
  let sequelize: Sequelize
  let ENCRYPTED: ReturnType<typeof createEncryptedType>

  beforeEach(() => {
    sequelize = new Sequelize('sqlite::memory:', { logging: false })
    ENCRYPTED = createEncryptedType()
  })

  it('should extract schema from model with encrypted columns', () => {
    class User extends Model {}

    User.init(
      {
        id: { type: DataTypes.INTEGER, primaryKey: true },
        email: {
          type: ENCRYPTED('email', {
            dataType: 'string',
            equality: true,
            freeTextSearch: true,
          }),
        },
        age: {
          type: ENCRYPTED('age', {
            dataType: 'number',
            orderAndRange: true,
          }),
        },
      },
      { sequelize, modelName: 'User', tableName: 'users' }
    )

    const schema = extractProtectSchema(User)

    expect(schema).toBeDefined()
    expect(schema.tableName).toBe('users')
    // Schema should have email and age columns
    expect(Object.keys(schema.columns)).toContain('email')
    expect(Object.keys(schema.columns)).toContain('age')
  })

  it('should throw error if model has no encrypted columns', () => {
    class User extends Model {}

    User.init(
      {
        id: { type: DataTypes.INTEGER, primaryKey: true },
        name: { type: DataTypes.STRING },
      },
      { sequelize, modelName: 'User', tableName: 'users' }
    )

    expect(() => extractProtectSchema(User)).toThrow(
      'Model users has no encrypted columns'
    )
  })

  it('should map equality config to match index', () => {
    class User extends Model {}

    User.init(
      {
        email: {
          type: ENCRYPTED('email', {
            equality: true,
          }),
        },
      },
      { sequelize, modelName: 'User', tableName: 'users' }
    )

    const schema = extractProtectSchema(User)
    const emailColumn = (schema as any).columns.email

    expect(emailColumn.indexes).toContainEqual(
      expect.objectContaining({ kind: 'match' })
    )
  })

  it('should map orderAndRange config to ore index', () => {
    class User extends Model {}

    User.init(
      {
        age: {
          type: ENCRYPTED('age', {
            dataType: 'number',
            orderAndRange: true,
          }),
        },
      },
      { sequelize, modelName: 'User', tableName: 'users' }
    )

    const schema = extractProtectSchema(User)
    const ageColumn = (schema as any).columns.age

    expect(ageColumn.indexes).toContainEqual({ kind: 'ore' })
  })
})

describe('extractProtectSchemas', () => {
  let sequelize: Sequelize
  let ENCRYPTED: ReturnType<typeof createEncryptedType>

  beforeEach(() => {
    sequelize = new Sequelize('sqlite::memory:', { logging: false })
    ENCRYPTED = createEncryptedType()
  })

  it('should extract schemas from multiple models', () => {
    class User extends Model {}
    class Post extends Model {}

    User.init(
      {
        email: { type: ENCRYPTED('email', { equality: true }) },
      },
      { sequelize, modelName: 'User', tableName: 'users' }
    )

    Post.init(
      {
        title: { type: ENCRYPTED('title', { freeTextSearch: true }) },
      },
      { sequelize, modelName: 'Post', tableName: 'posts' }
    )

    const schemas = extractProtectSchemas(User, Post)

    expect(schemas).toHaveLength(2)
    expect(schemas[0].tableName).toBe('users')
    expect(schemas[1].tableName).toBe('posts')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/sequelize && pnpm test schema-extraction`
Expected: FAIL with "Cannot find module '../src/schema-extraction'"

**Step 3: Write minimal implementation**

Create `packages/sequelize/src/schema-extraction.ts`:

```typescript
import type { ModelStatic, Model } from 'sequelize'
import { csTable, csColumn } from '@cipherstash/schema'
import type {
  ProtectTable,
  ProtectTableColumn,
} from '@cipherstash/schema'
import { getEncryptedColumnConfig } from './data-type'

/**
 * Extract Protect.js schema from a Sequelize model
 *
 * @param model - Sequelize model with encrypted columns
 * @returns Protect table schema
 * @throws Error if model has no encrypted columns
 */
export function extractProtectSchema<M extends Model>(
  model: ModelStatic<M>
): ProtectTable<ProtectTableColumn> {
  const tableName = model.tableName || model.name
  const attributes = model.getAttributes()

  const columns: Record<string, any> = {}

  for (const [fieldName, attribute] of Object.entries(attributes)) {
    const config = getEncryptedColumnConfig(fieldName)

    if (!config) {
      // Not an encrypted column, skip
      continue
    }

    // Determine data type (cast parameter for Protect)
    const dataType = config.dataType || 'string'

    // Build indexes array based on configuration
    const indexes: any[] = []

    if (config.equality) {
      const tokenFilters = Array.isArray(config.equality)
        ? config.equality
        : [{ kind: 'downcase' }]

      indexes.push({
        kind: 'match',
        tokenFilters,
      })
    }

    if (config.freeTextSearch) {
      const matchOpts =
        typeof config.freeTextSearch === 'object'
          ? config.freeTextSearch
          : {
              tokenFilters: [{ kind: 'downcase' }],
              tokenizer: { kind: 'ngram', tokenLength: 3 },
            }

      indexes.push({
        kind: 'match',
        ...matchOpts,
      })
    }

    if (config.orderAndRange) {
      indexes.push({ kind: 'ore' })
    }

    // Create Protect column
    columns[fieldName] = csColumn({
      cast: dataType,
      indexes,
    })
  }

  if (Object.keys(columns).length === 0) {
    throw new Error(
      `Model ${tableName} has no encrypted columns. Use DataTypes.ENCRYPTED to define encrypted columns.`
    )
  }

  // IMPORTANT: Pass tableName as first parameter to csTable
  return csTable(tableName, columns)
}

/**
 * Helper to extract schemas from multiple models at once
 *
 * @param models - Sequelize models to extract schemas from
 * @returns Array of Protect table schemas
 */
export function extractProtectSchemas(
  ...models: ModelStatic<any>[]
): ProtectTable<ProtectTableColumn>[] {
  return models.map(extractProtectSchema)
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/sequelize && pnpm test schema-extraction`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sequelize/src/schema-extraction.ts packages/sequelize/__tests__/schema-extraction.test.ts
git commit -m "feat(sequelize): implement schema extraction from Sequelize models"
```

---

## Task 4: Hook Implementation - Helper Functions

**Files:**
- Create: `packages/sequelize/src/hooks.ts`
- Create: `packages/sequelize/__tests__/hooks.test.ts`

**Step 1: Write the failing test for helper functions**

Create `packages/sequelize/__tests__/hooks.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Sequelize, Model, DataTypes, Op } from 'sequelize'
import { createEncryptedType } from '../src/data-type'
import { addProtectHooks } from '../src/hooks'
import type { ProtectClient } from '@cipherstash/protect'

// Mock ProtectClient
const createMockProtectClient = (): ProtectClient => ({
  createSearchTerms: vi.fn().mockResolvedValue({
    data: ['encrypted_value'],
    failure: null,
  }),
  bulkDecryptModels: vi.fn().mockResolvedValue({
    data: [{ email: 'test@example.com', age: 25 }],
    failure: null,
  }),
} as any)

describe('addProtectHooks', () => {
  let sequelize: Sequelize
  let ENCRYPTED: ReturnType<typeof createEncryptedType>
  let mockProtectClient: ProtectClient

  beforeEach(() => {
    sequelize = new Sequelize('sqlite::memory:', { logging: false })
    ENCRYPTED = createEncryptedType()
    mockProtectClient = createMockProtectClient()
  })

  it('should install beforeFind and afterFind hooks', () => {
    class User extends Model {}

    User.init(
      {
        email: { type: ENCRYPTED('email', { equality: true }) },
      },
      { sequelize, modelName: 'User', tableName: 'users' }
    )

    addProtectHooks(User, mockProtectClient)

    // Check hooks are registered
    const hooks = (User as any).options.hooks
    expect(hooks.beforeFind).toBeDefined()
    expect(hooks.afterFind).toBeDefined()
  })
})

describe('WHERE clause transformation', () => {
  let sequelize: Sequelize
  let ENCRYPTED: ReturnType<typeof createEncryptedType>
  let mockProtectClient: ProtectClient

  beforeEach(() => {
    sequelize = new Sequelize('sqlite::memory:', { logging: false })
    ENCRYPTED = createEncryptedType()
    mockProtectClient = createMockProtectClient()
  })

  it('should encrypt simple equality condition', async () => {
    class User extends Model {}

    User.init(
      {
        email: { type: ENCRYPTED('email', { equality: true }) },
      },
      { sequelize, modelName: 'User', tableName: 'users' }
    )

    addProtectHooks(User, mockProtectClient)

    // Simulate beforeFind hook with simple WHERE
    const options = {
      where: { email: 'test@example.com' },
    }

    // Hook should transform WHERE clause
    await (User as any).options.hooks.beforeFind[0](options)

    expect(mockProtectClient.createSearchTerms).toHaveBeenCalled()
    expect(options.where.email).toBe('encrypted_value')
  })

  it('should encrypt Op.eq operator', async () => {
    class User extends Model {}

    User.init(
      {
        email: { type: ENCRYPTED('email', { equality: true }) },
      },
      { sequelize, modelName: 'User', tableName: 'users' }
    )

    addProtectHooks(User, mockProtectClient)

    const options = {
      where: { email: { [Op.eq]: 'test@example.com' } },
    }

    await (User as any).options.hooks.beforeFind[0](options)

    expect(mockProtectClient.createSearchTerms).toHaveBeenCalled()
    expect(options.where.email[Op.eq]).toBe('encrypted_value')
  })

  it('should not transform non-encrypted columns', async () => {
    class User extends Model {}

    User.init(
      {
        email: { type: ENCRYPTED('email', { equality: true }) },
        name: { type: DataTypes.STRING },
      },
      { sequelize, modelName: 'User', tableName: 'users' }
    )

    addProtectHooks(User, mockProtectClient)

    const options = {
      where: {
        email: 'test@example.com',
        name: 'John'
      },
    }

    await (User as any).options.hooks.beforeFind[0](options)

    // email should be encrypted
    expect(options.where.email).toBe('encrypted_value')
    // name should remain unchanged
    expect(options.where.name).toBe('John')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/sequelize && pnpm test hooks`
Expected: FAIL with "Cannot find module '../src/hooks'"

**Step 3: Write minimal implementation - helper functions first**

Create `packages/sequelize/src/hooks.ts`:

```typescript
import type { Model, ModelStatic, FindOptions } from 'sequelize'
import { Op } from 'sequelize'
import type { ProtectClient } from '@cipherstash/protect'
import type { ProtectTable, ProtectTableColumn } from '@cipherstash/schema'
import { extractProtectSchema } from './schema-extraction'
import { getEncryptedColumnConfig } from './data-type'

/**
 * Encrypt a single value for searching
 */
async function encryptValue(
  value: any,
  columnName: string,
  protectClient: ProtectClient,
  protectTable: ProtectTable<ProtectTableColumn>
): Promise<any> {
  const column = (protectTable as any).columns[columnName]
  if (!column) return value

  const result = await protectClient.createSearchTerms([
    {
      value,
      column,
      table: protectTable,
    },
  ])

  if (result.failure) {
    throw new Error(`Encryption failed: ${result.failure.message}`)
  }

  return result.data[0]
}

/**
 * Bulk encrypt array of values
 */
async function bulkEncryptValues(
  values: any[],
  columnName: string,
  protectClient: ProtectClient,
  protectTable: ProtectTable<ProtectTableColumn>
): Promise<any[]> {
  const column = (protectTable as any).columns[columnName]
  if (!column) return values

  const result = await protectClient.createSearchTerms(
    values.map((value) => ({
      value,
      column,
      table: protectTable,
    }))
  )

  if (result.failure) {
    throw new Error(`Bulk encryption failed: ${result.failure.message}`)
  }

  return result.data
}

/**
 * Transform operators (Op.eq, Op.gt, etc.) for encrypted columns
 */
async function transformOperators(
  operatorValue: any,
  columnName: string,
  protectClient: ProtectClient,
  protectTable: ProtectTable<ProtectTableColumn>
): Promise<any> {
  const columnConfig = getEncryptedColumnConfig(columnName)

  // Simple equality: { email: 'test@example.com' }
  if (typeof operatorValue !== 'object' || operatorValue === null) {
    return await encryptValue(
      operatorValue,
      columnName,
      protectClient,
      protectTable
    )
  }

  const transformed: any = {}

  for (const [op, opValue] of Object.entries(operatorValue)) {
    switch (op) {
      case Op.eq:
      case Op.ne:
        if (!columnConfig?.equality) {
          throw new Error(
            `Column ${columnName} doesn't have equality index`
          )
        }
        transformed[op] = await encryptValue(
          opValue,
          columnName,
          protectClient,
          protectTable
        )
        break

      case Op.gt:
      case Op.gte:
      case Op.lt:
      case Op.lte:
        if (!columnConfig?.orderAndRange) {
          throw new Error(
            `Column ${columnName} doesn't have orderAndRange index`
          )
        }
        transformed[op] = await encryptValue(
          opValue,
          columnName,
          protectClient,
          protectTable
        )
        break

      case Op.like:
      case Op.iLike:
      case Op.notLike:
      case Op.notILike:
        if (!columnConfig?.freeTextSearch) {
          throw new Error(
            `Column ${columnName} doesn't have freeTextSearch index`
          )
        }
        transformed[op] = await encryptValue(
          opValue,
          columnName,
          protectClient,
          protectTable
        )
        break

      case Op.between:
      case Op.notBetween:
        if (!columnConfig?.orderAndRange) {
          throw new Error(
            `Column ${columnName} doesn't have orderAndRange index`
          )
        }
        if (Array.isArray(opValue) && opValue.length === 2) {
          const [min, max] = await bulkEncryptValues(
            opValue,
            columnName,
            protectClient,
            protectTable
          )
          transformed[op] = [min, max]
        }
        break

      case Op.in:
      case Op.notIn:
        if (!columnConfig?.equality) {
          throw new Error(
            `Column ${columnName} doesn't have equality index`
          )
        }
        if (Array.isArray(opValue)) {
          transformed[op] = await bulkEncryptValues(
            opValue,
            columnName,
            protectClient,
            protectTable
          )
        }
        break

      default:
        // Pass through other operators unchanged
        transformed[op] = opValue
    }
  }

  return transformed
}

/**
 * Recursively transform WHERE clause to encrypt values for encrypted columns
 */
async function transformWhereClause(
  where: any,
  protectClient: ProtectClient,
  protectTable: ProtectTable<ProtectTableColumn>
): Promise<any> {
  const transformed: any = {}

  for (const [key, value] of Object.entries(where)) {
    // Handle logical operators (Op.and, Op.or)
    if (key === Op.and || key === Op.or) {
      transformed[key] = await Promise.all(
        (value as any[]).map((clause) =>
          transformWhereClause(clause, protectClient, protectTable)
        )
      )
      continue
    }

    // Check if this is an encrypted column
    const columnConfig = getEncryptedColumnConfig(key)

    if (!columnConfig) {
      // Not encrypted, keep as-is
      transformed[key] = value
      continue
    }

    // Transform operators for encrypted column
    transformed[key] = await transformOperators(
      value,
      key,
      protectClient,
      protectTable
    )
  }

  return transformed
}

/**
 * Installs beforeFind and afterFind hooks on a Sequelize model
 * to handle transparent encryption/decryption
 */
export function addProtectHooks<M extends Model>(
  model: ModelStatic<M>,
  protectClient: ProtectClient
): void {
  // Extract Protect schema from Sequelize model
  const protectTable = extractProtectSchema(model)

  /**
   * beforeFind: Transform WHERE clause to encrypt search values
   */
  model.addHook('beforeFind', async (options: FindOptions) => {
    if (!options.where) return

    // Transform WHERE clause recursively
    options.where = await transformWhereClause(
      options.where,
      protectClient,
      protectTable
    )
  })

  /**
   * afterFind: Decrypt results
   */
  model.addHook('afterFind', async (result: M | M[] | null) => {
    if (!result) return result

    const models = Array.isArray(result) ? result : [result]
    if (models.length === 0) return result

    // Bulk decrypt all models
    const decrypted = await protectClient.bulkDecryptModels(
      models.map((m) => m.get({ plain: true }))
    )

    if (decrypted.failure) {
      throw new Error(`Decryption failed: ${decrypted.failure.message}`)
    }

    // Update model instances with decrypted values
    for (let i = 0; i < models.length; i++) {
      models[i].set(decrypted.data[i], { raw: true })
    }

    return result
  })
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/sequelize && pnpm test hooks`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sequelize/src/hooks.ts packages/sequelize/__tests__/hooks.test.ts
git commit -m "feat(sequelize): implement beforeFind/afterFind hooks for transparent encryption"
```

---

## Task 5: README Documentation

**Files:**
- Create: `packages/sequelize/README.md`

**Step 1: Create comprehensive README**

Create `packages/sequelize/README.md`:

```markdown
# Protect.js Sequelize ORM Integration

**Type-safe encryption for Sequelize ORM with searchable queries**

Seamlessly integrate Protect.js with Sequelize ORM and PostgreSQL to encrypt your data while maintaining full query capabilities—equality, range queries, text search, and sorting—all with complete TypeScript type safety.

## Features

- 🔒 **Transparent encryption/decryption** using Sequelize hooks
- 🔍 **Searchable encryption** with equality, range, and text search
- ⚡ **Bulk operations** for high performance
- 🎯 **Use normal Sequelize operators** to query encrypted data

## Installation

```bash
npm install @cipherstash/protect @cipherstash/sequelize sequelize
```

## Database Setup

Before using encrypted columns, you need to install the CipherStash EQL (Encrypt Query Language) functions in your PostgreSQL database.

```bash
curl -sL https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt.sql | psql $DATABASE_URL
```

## Quick Start

### 1. Define your model with encrypted columns

```typescript
// models/user.ts
import { Model, DataTypes } from 'sequelize'
import { createEncryptedType } from '@cipherstash/sequelize'

const ENCRYPTED = createEncryptedType()

class User extends Model {
  declare id: number
  declare email: string
  declare age: number
  declare profile: { name: string; bio: string }
}

User.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  // String with searchable encryption
  email: {
    type: ENCRYPTED('email', {
      equality: true,
      freeTextSearch: true,
      orderAndRange: true,
    })
  },

  // Number with range queries
  age: {
    type: ENCRYPTED('age', {
      dataType: 'number',
      equality: true,
      orderAndRange: true,
    })
  },

  // JSON object
  profile: {
    type: ENCRYPTED('profile', {
      dataType: 'json',
    })
  },
}, { sequelize, tableName: 'users' })
```

> [!TIP]
> Always specify the column name and data type for full type safety after decryption.

### 2. Initialize Protect.js

```typescript
// protect/config.ts
import { protect } from '@cipherstash/protect'
import { extractProtectSchema, addProtectHooks } from '@cipherstash/sequelize'
import { User } from '../models/user'

// Extract Protect.js schema from Sequelize model
const userSchema = extractProtectSchema(User)

// Initialize Protect.js client
export const protectClient = await protect({
  schemas: [userSchema]
})

// Install hooks on model (do this ONCE during initialization)
addProtectHooks(User, protectClient)
```

### 3. Use normal Sequelize syntax!

```typescript
// Equality search - automatically encrypted!
const user = await User.findOne({
  where: { email: 'john@example.com' }
})
// Result is automatically decrypted!

// Range queries
const adults = await User.findAll({
  where: { age: { [Op.gte]: 18 } }
})

// Text search (LIKE/ILIKE)
const gmailUsers = await User.findAll({
  where: { email: { [Op.iLike]: '%@gmail.com' } }
})

// Complex queries
const results = await User.findAll({
  where: {
    [Op.and]: [
      { age: { [Op.between]: [25, 35] } },
      { email: { [Op.iLike]: '%developer%' } }
    ]
  },
  order: [['age', 'DESC']],  // Sorting works too!
  limit: 10
})
```

## Available Operators

All operators automatically handle encryption for encrypted columns.

### Comparison Operators
- `Op.eq` - Equality (requires `equality: true`)
- `Op.ne` - Not equal (requires `equality: true`)
- `Op.gt` - Greater than (requires `orderAndRange: true`)
- `Op.gte` - Greater than or equal (requires `orderAndRange: true`)
- `Op.lt` - Less than (requires `orderAndRange: true`)
- `Op.lte` - Less than or equal (requires `orderAndRange: true`)

### Range Operators
- `Op.between` - Between (requires `orderAndRange: true`)
- `Op.notBetween` - Not between (requires `orderAndRange: true`)

### Text Search Operators
- `Op.like` - LIKE (requires `freeTextSearch: true`)
- `Op.iLike` - ILIKE case-insensitive (requires `freeTextSearch: true`)
- `Op.notLike` - NOT LIKE (requires `freeTextSearch: true`)
- `Op.notILike` - NOT ILIKE (requires `freeTextSearch: true`)

### Array Operators
- `Op.in` - In array (requires `equality: true`)
- `Op.notIn` - Not in array (requires `equality: true`)

### Logical Operators
- `Op.and` - AND
- `Op.or` - OR

## API Reference

### `createEncryptedType()`

Creates the ENCRYPTED data type factory for Sequelize.

Returns a function that creates encrypted column definitions.

**Usage:**
```typescript
const ENCRYPTED = createEncryptedType()

// Use in model definition
email: {
  type: ENCRYPTED('email', {
    dataType: 'string',  // Default
    equality: true,
    freeTextSearch: true,
    orderAndRange: true
  })
}
```

**Options:**
- `dataType?: 'string' | 'number' | 'json'` - Data type (default: `'string'`)
- `equality?: boolean | TokenFilter[]` - Enable equality queries
- `freeTextSearch?: boolean | MatchIndexOpts` - Enable text search (LIKE/ILIKE)
- `orderAndRange?: boolean` - Enable range queries and sorting

### `extractProtectSchema(model)`

Extracts a Protect.js schema from a Sequelize model definition.

**Parameters:**
- `model` - Sequelize model with encrypted columns

**Returns:** Protect.js schema object

### `addProtectHooks(model, protectClient)`

Installs beforeFind and afterFind hooks on a Sequelize model.

**Parameters:**
- `model` - Sequelize model to add hooks to
- `protectClient` - Initialized Protect.js client

**Important:** Call this ONCE during app initialization, not per-request.

## TypeScript Support

Full TypeScript support with proper type inference:

```typescript
class User extends Model {
  declare email: string  // Type is string (decrypted)
  declare age: number    // Type is number (decrypted)
}

const user = await User.findOne({ where: { email: 'test@example.com' } })
console.log(user.email)  // ✅ TypeScript knows this is string
console.log(user.age)    // ✅ TypeScript knows this is number
```

## License

MIT
```

**Step 2: Commit**

```bash
git add packages/sequelize/README.md
git commit -m "docs(sequelize): add comprehensive README with usage examples"
```

---

## Task 6: Build and Verification

**Step 1: Build the package**

Run: `cd packages/sequelize && pnpm build`
Expected: Build succeeds, creates `dist/` directory

**Step 2: Run all tests**

Run: `cd packages/sequelize && pnpm test`
Expected: All tests PASS

**Step 3: Verify exports**

Run: `ls -la packages/sequelize/dist/`
Expected: See `index.js`, `index.cjs`, `index.d.ts`

**Step 4: Commit**

```bash
git add packages/sequelize/dist/
git commit -m "build(sequelize): compile TypeScript and generate declarations"
```

---

## Final Verification Checklist

- [ ] All tests passing (`pnpm test`)
- [ ] Build successful (`pnpm build`)
- [ ] TypeScript declarations generated
- [ ] README documentation complete
- [ ] All files committed to git
- [ ] Package exports correctly configured
- [ ] Peer dependencies properly declared

## Next Steps (Future Enhancements)

1. **Write operation hooks** - Add `beforeCreate`/`beforeUpdate` for automatic encryption
2. **Integration tests** - Test with real PostgreSQL database
3. **Association support** - Test and fix hooks with `include`
4. **Performance benchmarks** - Compare with Drizzle integration
5. **Migration helpers** - CLI tool for Sequelize migrations
