import { type Result, withResult } from '@byteslice/result'
import {
  encryptBulk,
  encryptQueryBulk,
  ProtectError as FfiProtectError,
} from '@cipherstash/protect-ffi'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type {
  Client,
  Encrypted,
  EncryptedSearchTerm,
  JsPlaintext,
  JsonContainmentSearchTerm,
  JsonPathSearchTerm,
  QueryOpName,
  SearchTerm,
  SimpleSearchTerm,
} from '../../types'
import { queryTypeToFfi } from '../../types'
import { noClientError } from '../index'
import { buildNestedObject, toJsonPath } from './json-path-utils'
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

/** Tracks JSON containment items - pass raw JSON to FFI */
type JsonContainmentItem = {
  termIndex: number
  plaintext: JsPlaintext
  column: string
  table: string
}

/** Tracks JSON path items that need value encryption */
type JsonPathEncryptionItem = {
  plaintext: JsPlaintext
  column: string
  table: string
}

/**
 * Helper function to encrypt search terms
 * Shared logic between SearchTermsOperation and SearchTermsOperationWithLockContext
 * @param client The client to use for encryption
 * @param terms The search terms to encrypt
 * @param metadata Audit metadata for encryption
 */
async function encryptSearchTermsHelper(
  client: Client,
  terms: SearchTerm[],
  metadata: Record<string, unknown> | undefined,
): Promise<EncryptedSearchTerm[]> {
  if (!client) {
    throw noClientError()
  }

  // Partition terms by type
  const simpleTermsWithIndex: Array<{ term: SimpleSearchTerm; index: number }> =
    []
  // JSON containment items - pass raw JSON to FFI
  const jsonContainmentItems: JsonContainmentItem[] = []
  // JSON path items that need value encryption
  const jsonPathItems: JsonPathEncryptionItem[] = []
  // Selector-only terms (JSON path without value)
  const selectorOnlyItems: Array<{
    selector: string
    column: string
    table: string
  }> = []

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

      // Pass raw JSON directly - FFI handles flattening internally
      jsonContainmentItems.push({
        termIndex: i,
        plaintext: term.value,
        column: term.column.getName(),
        table: term.table.tableName,
      })
    } else if (isJsonPathTerm(term)) {
      // Path query - validate ste_vec index
      const columnConfig = term.column.build()

      if (!columnConfig.indexes.ste_vec) {
        throw new Error(
          `Column "${term.column.getName()}" does not have ste_vec index configured. Use .searchableJson() when defining the column.`,
        )
      }

      if (term.value !== undefined) {
        // Path query with value - wrap in nested object
        const pathArray = Array.isArray(term.path)
          ? term.path
          : term.path.split('.')
        const wrappedValue = buildNestedObject(pathArray, term.value)
        jsonPathItems.push({
          plaintext: wrappedValue,
          column: term.column.getName(),
          table: term.table.tableName,
        })
      } else {
        // Path-only terms (no value) need selector encryption
        const selector = toJsonPath(term.path)
        selectorOnlyItems.push({
          selector,
          column: term.column.getName(),
          table: term.table.tableName,
        })
      }
    }
  }

  // Encrypt simple terms with encryptBulk
  const simpleEncrypted =
    simpleTermsWithIndex.length > 0
      ? await encryptBulk(client, {
          plaintexts: simpleTermsWithIndex.map(({ term }) => {
            return {
              plaintext: term.value,
              column: term.column.getName(),
              table: term.table.tableName,
            }
          }),
          unverifiedContext: metadata,
        })
      : []

  // Encrypt JSON containment terms - pass raw JSON, FFI handles flattening
  const jsonContainmentEncrypted =
    jsonContainmentItems.length > 0
      ? await encryptQueryBulk(client, {
          queries: jsonContainmentItems.map((item) => ({
            plaintext: item.plaintext,
            column: item.column,
            table: item.table,
            indexType: queryTypeToFfi.searchableJson,
            queryOp: 'default' as QueryOpName,
          })),
          unverifiedContext: metadata,
        })
      : []

  // Encrypt selectors for JSON terms without values (ste_vec_selector op)
  const selectorOnlyEncrypted =
    selectorOnlyItems.length > 0
      ? await encryptQueryBulk(client, {
          queries: selectorOnlyItems.map((item) => ({
            plaintext: item.selector,
            column: item.column,
            table: item.table,
            indexType: queryTypeToFfi.searchableJson,
            queryOp: 'ste_vec_selector' as QueryOpName,
          })),
          unverifiedContext: metadata,
        })
      : []

  // Encrypt JSON path terms with values
  const jsonPathEncrypted =
    jsonPathItems.length > 0
      ? await encryptQueryBulk(client, {
          queries: jsonPathItems.map((item) => ({
            plaintext: item.plaintext,
            column: item.column,
            table: item.table,
            indexType: queryTypeToFfi.searchableJson,
            queryOp: 'default' as QueryOpName,
          })),
          unverifiedContext: metadata,
        })
      : []

  // Reassemble results in original order
  const results: EncryptedSearchTerm[] = new Array(terms.length)
  let simpleIdx = 0
  let containmentIdx = 0
  let pathIdx = 0
  let selectorOnlyIdx = 0

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
      // FFI returns complete { sv: [...] } structure - use directly
      results[i] = jsonContainmentEncrypted[containmentIdx] as Encrypted
      containmentIdx++
    } else if (isJsonPathTerm(term)) {
      if (term.value !== undefined) {
        // FFI returns complete { sv: [...] } structure for path+value queries
        results[i] = jsonPathEncrypted[pathIdx] as Encrypted
        pathIdx++
      } else {
        // Path-only (no value comparison)
        results[i] = selectorOnlyEncrypted[selectorOnlyIdx]
        selectorOnlyIdx++
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
        )

        return results
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
        code: error instanceof FfiProtectError ? error.code : undefined,
      }),
    )
  }

  public getOperation() {
    return { client: this.client, terms: this.terms }
  }
}
