import { type Result, withResult } from '@byteslice/result'
import { encryptBulk, encryptQueryBulk } from '@cipherstash/protect-ffi'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { Context, CtsToken, LockContext } from '../../identify'
import type {
  Client,
  Encrypted,
  EncryptedSearchTerm,
  JsPlaintext,
  JsonContainmentSearchTerm,
  JsonPath,
  JsonPathSearchTerm,
  QueryOpName,
  SearchTerm,
  SimpleSearchTerm,
} from '../../types'
import { noClientError } from '../index'
import { ProtectOperation } from './base-operation'

/**
 * Type guard to check if a search term is a JSON path search term
 */
function isJsonPathTerm(term: SearchTerm): term is JsonPathSearchTerm {
  return 'path' in term
}

/**
 * Type guard to check if a search term is a JSON containment search term
 */
function isJsonContainmentTerm(
  term: SearchTerm,
): term is JsonContainmentSearchTerm {
  return 'containmentType' in term
}

/**
 * Type guard to check if a search term is a simple value search term
 */
function isSimpleSearchTerm(term: SearchTerm): term is SimpleSearchTerm {
  return !isJsonPathTerm(term) && !isJsonContainmentTerm(term)
}

/**
 * Converts a path to SteVec selector format: prefix/path/to/key
 */
function pathToSelector(path: JsonPath, prefix: string): string {
  const pathArray = Array.isArray(path) ? path : path.split('.')
  return `${prefix}/${pathArray.join('/')}`
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

/**
 * Flattens nested JSON into path-value pairs for containment queries.
 * Returns the selector and a JSON object containing the value at the path.
 */
function flattenJson(
  obj: Record<string, unknown>,
  prefix: string,
  currentPath: string[] = [],
): Array<{ selector: string; value: Record<string, unknown> }> {
  const results: Array<{ selector: string; value: Record<string, unknown> }> =
    []

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
 * Helper function to encrypt search terms
 * Shared logic between SearchTermsOperation and SearchTermsOperationWithLockContext
 * @param client The client to use for encryption
 * @param terms The search terms to encrypt
 * @param metadata Audit metadata for encryption
 * @param lockContextData Optional lock context data { context: Context; ctsToken: CtsToken }
 */
async function encryptSearchTermsHelper(
  client: Client,
  terms: SearchTerm[],
  metadata: Record<string, unknown> | undefined,
  lockContextData: { context: Context; ctsToken: CtsToken } | undefined,
): Promise<EncryptedSearchTerm[]> {
  if (!client) {
    throw noClientError()
  }

  // Partition terms by type
  const simpleTermsWithIndex: Array<{ term: SimpleSearchTerm; index: number }> =
    []
  const jsonItemsWithIndex: JsonEncryptionItem[] = []

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i]

    if (isSimpleSearchTerm(term)) {
      simpleTermsWithIndex.push({ term, index: i })
    } else if (isJsonContainmentTerm(term)) {
      // Containment query - validate ste_vec index
      const columnConfig = term.column.build()

      if (!columnConfig.indexes.ste_vec) {
        throw new Error(
          `Column "${term.column.getName()}" does not have ste_vec index configured. Use .searchableJson() when defining the column.`,
        )
      }

      // Always use full table/column prefix
      const prefix = `${term.table.tableName}/${term.column.getName()}`

      // Flatten and add all leaf values
      const pairs = flattenJson(term.value, prefix)
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
    } else if (isJsonPathTerm(term)) {
      // Path query - validate ste_vec index
      const columnConfig = term.column.build()

      if (!columnConfig.indexes.ste_vec) {
        throw new Error(
          `Column "${term.column.getName()}" does not have ste_vec index configured. Use .searchableJson() when defining the column.`,
        )
      }

      // Always use full table/column prefix
      const prefix = `${term.table.tableName}/${term.column.getName()}`

      if (term.value !== undefined) {
        // Path query with value - wrap in nested object
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

  // Encrypt simple terms with encryptBulk
  const simpleEncrypted =
    simpleTermsWithIndex.length > 0
      ? await encryptBulk(client, {
          plaintexts: simpleTermsWithIndex.map(({ term }) => {
            const plaintext = {
              plaintext: term.value,
              column: term.column.getName(),
              table: term.table.tableName,
            }
            // Add lock context if provided
            if (lockContextData) {
              return { ...plaintext, lockContext: lockContextData.context }
            }
            return plaintext
          }),
          ...(lockContextData && { serviceToken: lockContextData.ctsToken }),
          unverifiedContext: metadata,
        })
      : []

  // Encrypt JSON terms with encryptQueryBulk
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
            // Add lock context if provided
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
  let simpleIdx = 0
  let jsonIdx = 0

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i]

    if (isSimpleSearchTerm(term)) {
      const encrypted = simpleEncrypted[simpleIdx]
      simpleIdx++

      // Apply return type formatting
      if (term.returnType === 'composite-literal') {
        results[i] = `(${JSON.stringify(JSON.stringify(encrypted))})`
      } else if (term.returnType === 'escaped-composite-literal') {
        results[i] =
          `${JSON.stringify(`(${JSON.stringify(JSON.stringify(encrypted))})`)}`
      } else {
        results[i] = encrypted
      }
    } else if (isJsonContainmentTerm(term)) {
      // Gather all encrypted values for this containment term
      // Always use full table/column prefix
      const prefix = `${term.table.tableName}/${term.column.getName()}`
      const pairs = flattenJson(term.value, prefix)
      const svEntries: Array<Record<string, unknown>> = []

      for (const pair of pairs) {
        svEntries.push({
          ...jsonEncrypted[jsonIdx],
          s: pair.selector,
        })
        jsonIdx++
      }

      results[i] = { sv: svEntries } as Encrypted
    } else if (isJsonPathTerm(term)) {
      // Always use full table/column prefix
      const prefix = `${term.table.tableName}/${term.column.getName()}`

      if (term.value !== undefined) {
        // Path query with value
        const selector = pathToSelector(term.path, prefix)
        results[i] = {
          ...jsonEncrypted[jsonIdx],
          s: selector,
        } as Encrypted
        jsonIdx++
      } else {
        // Path-only (no value comparison)
        const selector = pathToSelector(term.path, prefix)
        results[i] = { s: selector } as Encrypted
      }
    }
  }

  return results
}

export class SearchTermsOperation extends ProtectOperation<
  EncryptedSearchTerm[]
> {
  private client: Client
  private terms: SearchTerm[]

  constructor(client: Client, terms: SearchTerm[]) {
    super()
    this.client = client
    this.terms = terms
  }

  public async execute(): Promise<Result<EncryptedSearchTerm[], ProtectError>> {
    logger.debug('Creating search terms', {
      terms: this.terms,
    })

    return await withResult(
      async () => {
        const { metadata } = this.getAuditData()

        // Call helper with no lock context
        const results = await encryptSearchTermsHelper(
          this.client,
          this.terms,
          metadata,
          undefined,
        )

        return results
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  public withLockContext(
    lockContext: LockContext,
  ): SearchTermsOperationWithLockContext {
    return new SearchTermsOperationWithLockContext(this, lockContext)
  }

  public getOperation() {
    return { client: this.client, terms: this.terms }
  }
}

export class SearchTermsOperationWithLockContext extends ProtectOperation<
  EncryptedSearchTerm[]
> {
  private operation: SearchTermsOperation
  private lockContext: LockContext

  constructor(operation: SearchTermsOperation, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  public async execute(): Promise<Result<EncryptedSearchTerm[], ProtectError>> {
    return await withResult(
      async () => {
        const { client, terms } = this.operation.getOperation()

        logger.debug('Creating search terms WITH lock context', {
          termCount: terms.length,
        })

        const { metadata } = this.getAuditData()
        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        // Call helper with lock context
        const results = await encryptSearchTermsHelper(
          client,
          terms,
          metadata,
          { context: context.data.context, ctsToken: context.data.ctsToken },
        )

        return results
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}
