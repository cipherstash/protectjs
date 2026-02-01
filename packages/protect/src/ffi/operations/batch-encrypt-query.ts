import { type Result, withResult } from '@byteslice/result'
import {
  encryptBulk,
  encryptQueryBulk,
  ProtectError as FfiProtectError,
} from '@cipherstash/protect-ffi'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import {
  isJsonContainedByQueryTerm,
  isJsonContainsQueryTerm,
  isJsonPathQueryTerm,
  isScalarQueryTerm,
} from '../../query-term-guards'
import type {
  Client,
  Encrypted,
  EncryptedSearchTerm,
  QueryTypeName,
  JsPlaintext,
  QueryOpName,
  QueryTerm,
} from '../../types'
import { queryTypeToFfi } from '../../types'
import { noClientError } from '../index'
import { buildNestedObject, toJsonPath } from './json-path-utils'
import { ProtectOperation } from './base-operation'

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
 * Helper to check if a scalar term has an explicit queryType
 */
function hasExplicitQueryType(
  term: QueryTerm,
): term is QueryTerm & { queryType: QueryTypeName } {
  return 'queryType' in term && term.queryType !== undefined
}

/**
 * Helper function to encrypt batch query terms
 */
async function encryptBatchQueryTermsHelper(
  client: Client,
  terms: readonly QueryTerm[],
  metadata: Record<string, unknown> | undefined,
): Promise<EncryptedSearchTerm[]> {
  if (!client) {
    throw noClientError()
  }

  // Partition terms by type
  // Scalar terms WITH queryType → encryptQueryBulk (explicit control)
  const scalarWithQueryType: Array<{ term: QueryTerm; index: number }> = []
  // Scalar terms WITHOUT queryType → encryptBulk (auto-infer)
  const scalarAutoInfer: Array<{ term: QueryTerm; index: number }> = []
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

    if (isScalarQueryTerm(term)) {
      if (hasExplicitQueryType(term)) {
        scalarWithQueryType.push({ term, index: i })
      } else {
        scalarAutoInfer.push({ term, index: i })
      }
    } else if (isJsonContainsQueryTerm(term)) {
      // Validate ste_vec index
      const columnConfig = term.column.build()
      if (!columnConfig.indexes.ste_vec) {
        throw new Error(
          `Column "${term.column.getName()}" does not have ste_vec index configured. Use .searchableJson() when defining the column.`,
        )
      }

      // Pass raw JSON directly - FFI handles flattening internally
      jsonContainmentItems.push({
        termIndex: i,
        plaintext: term.contains,
        column: term.column.getName(),
        table: term.table.tableName,
      })
    } else if (isJsonContainedByQueryTerm(term)) {
      // Validate ste_vec index
      const columnConfig = term.column.build()
      if (!columnConfig.indexes.ste_vec) {
        throw new Error(
          `Column "${term.column.getName()}" does not have ste_vec index configured. Use .searchableJson() when defining the column.`,
        )
      }

      // Pass raw JSON directly - FFI handles flattening internally
      jsonContainmentItems.push({
        termIndex: i,
        plaintext: term.containedBy,
        column: term.column.getName(),
        table: term.table.tableName,
      })
    } else if (isJsonPathQueryTerm(term)) {
      // Validate ste_vec index
      const columnConfig = term.column.build()
      if (!columnConfig.indexes.ste_vec) {
        throw new Error(
          `Column "${term.column.getName()}" does not have ste_vec index configured. Use .searchableJson() when defining the column.`,
        )
      }

      if (term.value !== undefined) {
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

  // Encrypt scalar terms WITH explicit queryType using encryptQueryBulk
  const scalarExplicitEncrypted =
    scalarWithQueryType.length > 0
      ? await encryptQueryBulk(client, {
          queries: scalarWithQueryType.map(({ term }) => {
            if (!isScalarQueryTerm(term))
              throw new Error('Expected scalar term')
            return {
              plaintext: term.value,
              column: term.column.getName(),
              table: term.table.tableName,
              indexType: queryTypeToFfi[term.queryType!],
              queryOp: term.queryOp,
            }
          }),
          unverifiedContext: metadata,
        })
      : []

  // Encrypt scalar terms WITHOUT queryType using encryptBulk (auto-infer)
  const scalarAutoInferEncrypted =
    scalarAutoInfer.length > 0
      ? await encryptBulk(client, {
          plaintexts: scalarAutoInfer.map(({ term }) => {
            if (!isScalarQueryTerm(term))
              throw new Error('Expected scalar term')
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
  let scalarExplicitIdx = 0
  let scalarAutoInferIdx = 0
  let containmentIdx = 0
  let pathIdx = 0
  let selectorOnlyIdx = 0

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i]

    if (isScalarQueryTerm(term)) {
      // Determine which result array to pull from based on whether term had explicit queryType
      let encrypted: Encrypted
      if (hasExplicitQueryType(term)) {
        encrypted = scalarExplicitEncrypted[scalarExplicitIdx]
        scalarExplicitIdx++
      } else {
        encrypted = scalarAutoInferEncrypted[scalarAutoInferIdx]
        scalarAutoInferIdx++
      }

      if (term.returnType === 'composite-literal') {
        results[i] = `(${JSON.stringify(JSON.stringify(encrypted))})`
      } else if (term.returnType === 'escaped-composite-literal') {
        results[i] =
          `${JSON.stringify(`(${JSON.stringify(JSON.stringify(encrypted))})`)}`
      } else {
        results[i] = encrypted
      }
    } else if (isJsonContainsQueryTerm(term) || isJsonContainedByQueryTerm(term)) {
      // FFI returns complete { sv: [...] } structure - use directly
      results[i] = jsonContainmentEncrypted[containmentIdx] as Encrypted
      containmentIdx++
    } else if (isJsonPathQueryTerm(term)) {
      if (term.value !== undefined) {
        // FFI returns complete { sv: [...] } structure for path+value queries
        results[i] = jsonPathEncrypted[pathIdx] as Encrypted
        pathIdx++
      } else {
        results[i] = selectorOnlyEncrypted[selectorOnlyIdx]
        selectorOnlyIdx++
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
        )
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
        code: error instanceof FfiProtectError ? error.code : undefined,
      }),
    )
  }
}