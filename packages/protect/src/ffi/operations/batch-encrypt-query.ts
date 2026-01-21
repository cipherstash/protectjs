import { type Result, withResult } from '@byteslice/result'
import { encryptQueryBulk } from '@cipherstash/protect-ffi'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext, Context, CtsToken } from '../../identify'
import type {
  Client,
  Encrypted,
  EncryptedSearchTerm,
  QueryTerm,
  JsonPath,
  JsPlaintext,
  QueryOpName,
} from '../../types'
import {
  isScalarQueryTerm,
  isJsonPathQueryTerm,
  isJsonContainsQueryTerm,
  isJsonContainedByQueryTerm,
} from '../../query-term-guards'
import { noClientError } from '../index'
import { ProtectOperation } from './base-operation'

/**
 * Converts a path to SteVec selector format: prefix/path/to/key
 */
function pathToSelector(path: JsonPath, prefix: string): string {
  const pathArray = Array.isArray(path) ? path : path.split('.')
  return `${prefix}/${pathArray.join('/')}`
}

/**
 * Build a nested JSON object from a path array and a leaf value.
 */
function buildNestedObject(
  path: string[],
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) {
    return value as Record<string, unknown>
  }
  if (path.length === 1) {
    return { [path[0]]: value }
  }
  const [first, ...rest] = path
  return { [first]: buildNestedObject(rest, value) }
}

/**
 * Flattens nested JSON into path-value pairs for containment queries.
 */
function flattenJson(
  obj: Record<string, unknown>,
  prefix: string,
  currentPath: string[] = [],
): Array<{ selector: string; value: Record<string, unknown> }> {
  const results: Array<{ selector: string; value: Record<string, unknown> }> = []

  for (const [key, value] of Object.entries(obj)) {
    const newPath = [...currentPath, key]

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      results.push(
        ...flattenJson(value as Record<string, unknown>, prefix, newPath),
      )
    } else {
      const wrappedValue = buildNestedObject(newPath, value)
      results.push({
        selector: `${prefix}/${newPath.join('/')}`,
        value: wrappedValue,
      })
    }
  }

  return results
}

/** Tracks which items belong to which term for reassembly */
type JsonEncryptionItem = {
  termIndex: number
  selector: string
  isContainment: boolean
  plaintext: JsPlaintext
  column: string
  table: string
  queryOp: QueryOpName
}

/**
 * Helper function to encrypt batch query terms
 */
async function encryptBatchQueryTermsHelper(
  client: Client,
  terms: readonly QueryTerm[],
  metadata: Record<string, unknown> | undefined,
  lockContextData: { context: Context; ctsToken: CtsToken } | undefined,
): Promise<EncryptedSearchTerm[]> {
  if (!client) {
    throw noClientError()
  }

  // Partition terms by type
  const scalarTermsWithIndex: Array<{ term: QueryTerm; index: number }> = []
  const jsonItemsWithIndex: JsonEncryptionItem[] = []

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i]

    if (isScalarQueryTerm(term)) {
      scalarTermsWithIndex.push({ term, index: i })
    } else if (isJsonContainsQueryTerm(term)) {
      // Validate ste_vec index
      const columnConfig = term.column.build()
      if (!columnConfig.indexes.ste_vec) {
        throw new Error(
          `Column "${term.column.getName()}" does not have ste_vec index configured. ` +
            `Use .searchableJson() when defining the column.`,
        )
      }

      const prefix = `${term.table.tableName}/${term.column.getName()}`
      const pairs = flattenJson(term.contains, prefix)
      for (const pair of pairs) {
        jsonItemsWithIndex.push({
          termIndex: i,
          selector: pair.selector,
          isContainment: true,
          plaintext: pair.value,
          column: term.column.getName(),
          table: term.table.tableName,
          queryOp: 'default',
        })
      }
    } else if (isJsonContainedByQueryTerm(term)) {
      // Validate ste_vec index
      const columnConfig = term.column.build()
      if (!columnConfig.indexes.ste_vec) {
        throw new Error(
          `Column "${term.column.getName()}" does not have ste_vec index configured. ` +
            `Use .searchableJson() when defining the column.`,
        )
      }

      const prefix = `${term.table.tableName}/${term.column.getName()}`
      const pairs = flattenJson(term.containedBy, prefix)
      for (const pair of pairs) {
        jsonItemsWithIndex.push({
          termIndex: i,
          selector: pair.selector,
          isContainment: true,
          plaintext: pair.value,
          column: term.column.getName(),
          table: term.table.tableName,
          queryOp: 'default',
        })
      }
    } else if (isJsonPathQueryTerm(term)) {
      // Validate ste_vec index
      const columnConfig = term.column.build()
      if (!columnConfig.indexes.ste_vec) {
        throw new Error(
          `Column "${term.column.getName()}" does not have ste_vec index configured. ` +
            `Use .searchableJson() when defining the column.`,
        )
      }

      const prefix = `${term.table.tableName}/${term.column.getName()}`

      if (term.value !== undefined) {
        const pathArray = Array.isArray(term.path)
          ? term.path
          : term.path.split('.')
        const wrappedValue = buildNestedObject(pathArray, term.value)
        jsonItemsWithIndex.push({
          termIndex: i,
          selector: pathToSelector(term.path, prefix),
          isContainment: false,
          plaintext: wrappedValue,
          column: term.column.getName(),
          table: term.table.tableName,
          queryOp: 'default',
        })
      }
      // Path-only terms (no value) don't need encryption
    }
  }

  // Encrypt scalar terms with encryptQueryBulk (explicit index type)
  const scalarEncrypted =
    scalarTermsWithIndex.length > 0
      ? await encryptQueryBulk(client, {
          queries: scalarTermsWithIndex.map(({ term }) => {
            if (!isScalarQueryTerm(term)) throw new Error('Expected scalar term')
            const query = {
              plaintext: term.value,
              column: term.column.getName(),
              table: term.table.tableName,
              indexType: term.indexType,
              queryOp: term.queryOp,
            }
            if (lockContextData) {
              return { ...query, lockContext: lockContextData.context }
            }
            return query
          }),
          ...(lockContextData && { serviceToken: lockContextData.ctsToken }),
          unverifiedContext: metadata,
        })
      : []

  // Encrypt JSON terms with encryptQueryBulk (ste_vec index)
  const jsonEncrypted =
    jsonItemsWithIndex.length > 0
      ? await encryptQueryBulk(client, {
          queries: jsonItemsWithIndex.map((item) => {
            const query = {
              plaintext: item.plaintext,
              column: item.column,
              table: item.table,
              indexType: 'ste_vec' as const,
              queryOp: item.queryOp,
            }
            if (lockContextData) {
              return { ...query, lockContext: lockContextData.context }
            }
            return query
          }),
          ...(lockContextData && { serviceToken: lockContextData.ctsToken }),
          unverifiedContext: metadata,
        })
      : []

  // Reassemble results in original order
  const results: EncryptedSearchTerm[] = new Array(terms.length)
  let scalarIdx = 0
  let jsonIdx = 0

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i]

    if (isScalarQueryTerm(term)) {
      const encrypted = scalarEncrypted[scalarIdx]
      scalarIdx++

      if (term.returnType === 'composite-literal') {
        results[i] = `(${JSON.stringify(JSON.stringify(encrypted))})`
      } else if (term.returnType === 'escaped-composite-literal') {
        results[i] = `${JSON.stringify(`(${JSON.stringify(JSON.stringify(encrypted))})`)}`
      } else {
        results[i] = encrypted
      }
    } else if (isJsonContainsQueryTerm(term)) {
      const prefix = `${term.table.tableName}/${term.column.getName()}`
      const pairs = flattenJson(term.contains, prefix)
      const svEntries: Array<Record<string, unknown>> = []

      for (const pair of pairs) {
        svEntries.push({
          ...jsonEncrypted[jsonIdx],
          s: pair.selector,
        })
        jsonIdx++
      }

      results[i] = { sv: svEntries } as Encrypted
    } else if (isJsonContainedByQueryTerm(term)) {
      const prefix = `${term.table.tableName}/${term.column.getName()}`
      const pairs = flattenJson(term.containedBy, prefix)
      const svEntries: Array<Record<string, unknown>> = []

      for (const pair of pairs) {
        svEntries.push({
          ...jsonEncrypted[jsonIdx],
          s: pair.selector,
        })
        jsonIdx++
      }

      results[i] = { sv: svEntries } as Encrypted
    } else if (isJsonPathQueryTerm(term)) {
      const prefix = `${term.table.tableName}/${term.column.getName()}`

      if (term.value !== undefined) {
        const selector = pathToSelector(term.path, prefix)
        results[i] = {
          ...jsonEncrypted[jsonIdx],
          s: selector,
        } as Encrypted
        jsonIdx++
      } else {
        const selector = pathToSelector(term.path, prefix)
        results[i] = { s: selector } as Encrypted
      }
    }
  }

  return results
}

/**
 * @internal
 * Operation for encrypting multiple query terms in batch.
 * See {@link ProtectClient.encryptQuery} for the public interface.
 */
export class BatchEncryptQueryOperation extends ProtectOperation<
  EncryptedSearchTerm[]
> {
  private client: Client
  private terms: readonly QueryTerm[]

  constructor(client: Client, terms: readonly QueryTerm[]) {
    super()
    this.client = client
    this.terms = terms
  }

  public withLockContext(
    lockContext: LockContext,
  ): BatchEncryptQueryOperationWithLockContext {
    return new BatchEncryptQueryOperationWithLockContext(this, lockContext)
  }

  public getOperation(): { client: Client; terms: readonly QueryTerm[] } {
    return { client: this.client, terms: this.terms }
  }

  public async execute(): Promise<Result<EncryptedSearchTerm[], ProtectError>> {
    logger.debug('Encrypting batch query terms', {
      termCount: this.terms.length,
    })

    return await withResult(
      async () => {
        const { metadata } = this.getAuditData()
        return await encryptBatchQueryTermsHelper(
          this.client,
          this.terms,
          metadata,
          undefined,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}

export class BatchEncryptQueryOperationWithLockContext extends ProtectOperation<
  EncryptedSearchTerm[]
> {
  private operation: BatchEncryptQueryOperation
  private lockContext: LockContext

  constructor(
    operation: BatchEncryptQueryOperation,
    lockContext: LockContext,
  ) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  public async execute(): Promise<Result<EncryptedSearchTerm[], ProtectError>> {
    return await withResult(
      async () => {
        const { client, terms } = this.operation.getOperation()

        logger.debug('Encrypting batch query terms WITH lock context', {
          termCount: terms.length,
        })

        const { metadata } = this.getAuditData()
        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        return await encryptBatchQueryTermsHelper(
          client,
          terms,
          metadata,
          { context: context.data.context, ctsToken: context.data.ctsToken },
        )
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}
