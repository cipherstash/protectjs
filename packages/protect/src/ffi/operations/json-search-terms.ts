import { type Result, withResult } from '@byteslice/result'
import { encryptQueryBulk } from '@cipherstash/protect-ffi'
import type {
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
} from '@cipherstash/schema'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type {
  Client,
  Encrypted,
  JsonPath,
  JsonSearchTerm,
  JsPlaintext,
  QueryOpName,
} from '../../types'
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
 * Flattens nested JSON into path-value pairs for containment queries.
 * Returns the selector and a JSON object containing the value at the path.
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
      // Wrap the primitive value in a JSON object representing its path
      // This is needed because ste_vec_term expects JSON objects
      const wrappedValue = buildNestedObject(newPath, value)
      results.push({
        selector: `${prefix}/${newPath.join('/')}`,
        value: wrappedValue,
      })
    }
  }

  return results
}

/**
 * Build a nested JSON object from a path array and a leaf value.
 * E.g., ['user', 'role'], 'admin' => { user: { role: 'admin' } }
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

/** Tracks which items belong to which term for reassembly */
type EncryptionItem = {
  termIndex: number
  selector: string
  isContainment: boolean
  plaintext: JsPlaintext
  column: string
  table: string
  queryOp: QueryOpName
}

export class JsonSearchTermsOperation extends ProtectOperation<Encrypted[]> {
  private client: Client
  private terms: JsonSearchTerm[]

  constructor(client: Client, terms: JsonSearchTerm[]) {
    super()
    this.client = client
    this.terms = terms
  }

  public withLockContext(
    lockContext: LockContext,
  ): JsonSearchTermsOperationWithLockContext {
    return new JsonSearchTermsOperationWithLockContext(this, lockContext)
  }

  public getOperation() {
    return { client: this.client, terms: this.terms }
  }

  public async execute(): Promise<Result<Encrypted[], ProtectError>> {
    logger.debug('Creating JSON search terms', { termCount: this.terms.length })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        const { metadata } = this.getAuditData()

        // Collect all items to encrypt in a single batch
        const items: EncryptionItem[] = []

        for (let i = 0; i < this.terms.length; i++) {
          const term = this.terms[i]
          const columnConfig = term.column.build()
          const prefix = columnConfig.indexes.ste_vec?.prefix

          if (!prefix || prefix === '__RESOLVE_AT_BUILD__') {
            throw new Error(
              `Column "${term.column.getName()}" does not have ste_vec index configured. ` +
                `Use .searchableJson() when defining the column.`,
            )
          }

          if ('containmentType' in term) {
            // Containment query - flatten and add all leaf values
            const pairs = flattenJson(term.value, prefix)
            for (const pair of pairs) {
              items.push({
                termIndex: i,
                selector: pair.selector,
                isContainment: true,
                plaintext: pair.value,
                column: term.column.getName(),
                table: term.table.tableName,
                queryOp: 'default',
              })
            }
          } else if (term.value !== undefined) {
            // Path query with value - wrap the value in a JSON object
            const pathArray = Array.isArray(term.path)
              ? term.path
              : term.path.split('.')
            const wrappedValue = buildNestedObject(pathArray, term.value)
            items.push({
              termIndex: i,
              selector: pathToSelector(term.path, prefix),
              isContainment: false,
              plaintext: wrappedValue,
              column: term.column.getName(),
              table: term.table.tableName,
              queryOp: 'default',
            })
          }
        }

        // Single bulk query encryption call for efficiency
        const encrypted =
          items.length > 0
            ? await encryptQueryBulk(this.client, {
                queries: items.map((item) => ({
                  plaintext: item.plaintext,
                  column: item.column,
                  table: item.table,
                  indexType: 'ste_vec',
                  queryOp: item.queryOp,
                })),
                unverifiedContext: metadata,
              })
            : []

        // Reassemble results by term
        const results: Encrypted[] = []
        let encryptedIdx = 0

        for (let i = 0; i < this.terms.length; i++) {
          const term = this.terms[i]
          const columnConfig = term.column.build()
          const prefix = columnConfig.indexes.ste_vec?.prefix!

          if ('containmentType' in term) {
            // Gather all encrypted values for this containment term
            const svEntries: Array<Record<string, unknown>> = []
            const pairs = flattenJson(term.value, prefix)

            for (const pair of pairs) {
              svEntries.push({
                ...encrypted[encryptedIdx],
                s: pair.selector,
              })
              encryptedIdx++
            }

            results.push({ sv: svEntries } as Encrypted)
          } else if (term.value !== undefined) {
            // Path query with value
            const selector = pathToSelector(term.path, prefix)
            results.push({
              ...encrypted[encryptedIdx],
              s: selector,
            } as Encrypted)
            encryptedIdx++
          } else {
            // Path-only (no value comparison)
            const selector = pathToSelector(term.path, prefix)
            results.push({ s: selector } as Encrypted)
          }
        }

        return results
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}

export class JsonSearchTermsOperationWithLockContext extends ProtectOperation<
  Encrypted[]
> {
  private operation: JsonSearchTermsOperation
  private lockContext: LockContext

  constructor(
    operation: JsonSearchTermsOperation,
    lockContext: LockContext,
  ) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  public async execute(): Promise<Result<Encrypted[], ProtectError>> {
    return await withResult(
      async () => {
        const { client, terms } = this.operation.getOperation()

        logger.debug('Creating JSON search terms WITH lock context', {
          termCount: terms.length,
        })

        if (!client) {
          throw noClientError()
        }

        const { metadata } = this.getAuditData()
        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        // Collect all items to encrypt
        const items: EncryptionItem[] = []

        for (let i = 0; i < terms.length; i++) {
          const term = terms[i]
          const columnConfig = term.column.build()
          const prefix = columnConfig.indexes.ste_vec?.prefix

          if (!prefix || prefix === '__RESOLVE_AT_BUILD__') {
            throw new Error(
              `Column "${term.column.getName()}" does not have ste_vec index configured.`,
            )
          }

          if ('containmentType' in term) {
            const pairs = flattenJson(term.value, prefix)
            for (const pair of pairs) {
              items.push({
                termIndex: i,
                selector: pair.selector,
                isContainment: true,
                plaintext: pair.value,
                column: term.column.getName(),
                table: term.table.tableName,
                queryOp: 'default',
              })
            }
          } else if (term.value !== undefined) {
            // Path query with value - wrap the value in a JSON object
            const pathArray = Array.isArray(term.path)
              ? term.path
              : term.path.split('.')
            const wrappedValue = buildNestedObject(pathArray, term.value)
            items.push({
              termIndex: i,
              selector: pathToSelector(term.path, prefix),
              isContainment: false,
              plaintext: wrappedValue,
              column: term.column.getName(),
              table: term.table.tableName,
              queryOp: 'default',
            })
          }
        }

        // Single bulk query encryption with lock context
        const encrypted =
          items.length > 0
            ? await encryptQueryBulk(client, {
                queries: items.map((item) => ({
                  plaintext: item.plaintext,
                  column: item.column,
                  table: item.table,
                  indexType: 'ste_vec',
                  queryOp: item.queryOp,
                  lockContext: context.data.context,
                })),
                serviceToken: context.data.ctsToken,
                unverifiedContext: metadata,
              })
            : []

        // Reassemble results (same logic as base operation)
        const results: Encrypted[] = []
        let encryptedIdx = 0

        for (let i = 0; i < terms.length; i++) {
          const term = terms[i]
          const columnConfig = term.column.build()
          const prefix = columnConfig.indexes.ste_vec?.prefix!

          if ('containmentType' in term) {
            const svEntries: Array<Record<string, unknown>> = []
            const pairs = flattenJson(term.value, prefix)

            for (const pair of pairs) {
              svEntries.push({
                ...encrypted[encryptedIdx],
                s: pair.selector,
              })
              encryptedIdx++
            }

            results.push({ sv: svEntries } as Encrypted)
          } else if (term.value !== undefined) {
            const selector = pathToSelector(term.path, prefix)
            results.push({
              ...encrypted[encryptedIdx],
              s: selector,
            } as Encrypted)
            encryptedIdx++
          } else {
            const selector = pathToSelector(term.path, prefix)
            results.push({ s: selector } as Encrypted)
          }
        }

        return results
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}
