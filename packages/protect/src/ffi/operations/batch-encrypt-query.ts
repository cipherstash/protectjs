import { type Result, withResult } from '@byteslice/result'
import { encryptBulk, encryptQueryBulk } from '@cipherstash/protect-ffi'
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
import { buildNestedObject, flattenJson, pathToSelector, toDollarPath } from './json-path-utils'
import { ProtectOperation } from './base-operation'

/** Tracks which items belong to which term for reassembly */
type JsonEncryptionItem = {
  selector: string
  isContainment: boolean
  plaintext: JsPlaintext
  column: string
  table: string
  queryOp: QueryOpName
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
  const jsonItemsWithIndex: JsonEncryptionItem[] = []
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

      const prefix = `${term.table.tableName}/${term.column.getName()}`
      const pairs = flattenJson(term.contains, prefix)
      for (const pair of pairs) {
        jsonItemsWithIndex.push({
          selector: toDollarPath(pair.path),
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
          `Column "${term.column.getName()}" does not have ste_vec index configured. Use .searchableJson() when defining the column.`,
        )
      }

      const prefix = `${term.table.tableName}/${term.column.getName()}`
      const pairs = flattenJson(term.containedBy, prefix)
      for (const pair of pairs) {
        jsonItemsWithIndex.push({
          selector: toDollarPath(pair.path),
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
          `Column "${term.column.getName()}" does not have ste_vec index configured. Use .searchableJson() when defining the column.`,
        )
      }

      const prefix = `${term.table.tableName}/${term.column.getName()}`

      if (term.value !== undefined) {
        const pathArray = Array.isArray(term.path)
          ? term.path
          : term.path.split('.')
        const wrappedValue = buildNestedObject(pathArray, term.value)
        jsonItemsWithIndex.push({
          selector: toDollarPath(term.path),
          isContainment: false,
          plaintext: wrappedValue,
          column: term.column.getName(),
          table: term.table.tableName,
          queryOp: 'default',
        })
      } else {
        // Path-only terms (no value) need selector encryption
        const selector = toDollarPath(term.path)
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

  // Encrypt selectors for JSON terms with values (ste_vec_selector op)
  const selectorsEncrypted =
    jsonItemsWithIndex.length > 0
      ? await encryptQueryBulk(client, {
          queries: jsonItemsWithIndex.map((item) => {
            return {
              plaintext: item.selector,
              column: item.column,
              table: item.table,
              indexType: queryTypeToFfi.searchableJson,
              queryOp: 'ste_vec_selector' as QueryOpName,
            }
          }),
          unverifiedContext: metadata,
        })
      : []

  // Encrypt selectors for JSON terms without values (ste_vec_selector op)
  const selectorOnlyEncrypted =
    selectorOnlyItems.length > 0
      ? await encryptQueryBulk(client, {
          queries: selectorOnlyItems.map((item) => {
            return {
              plaintext: item.selector,
              column: item.column,
              table: item.table,
              indexType: queryTypeToFfi.searchableJson,
              queryOp: 'ste_vec_selector' as QueryOpName,
            }
          }),
          unverifiedContext: metadata,
        })
      : []

  // Encrypt JSON terms with encryptQueryBulk (searchableJson index)
  const jsonEncrypted =
    jsonItemsWithIndex.length > 0
      ? await encryptQueryBulk(client, {
          queries: jsonItemsWithIndex.map((item) => {
            return {
              plaintext: item.plaintext,
              column: item.column,
              table: item.table,
              indexType: queryTypeToFfi.searchableJson,
              queryOp: item.queryOp,
            }
          }),
          unverifiedContext: metadata,
        })
      : []

  // Reassemble results in original order
  const results: EncryptedSearchTerm[] = new Array(terms.length)
  let scalarExplicitIdx = 0
  let scalarAutoInferIdx = 0
  let jsonIdx = 0
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
    } else if (isJsonContainsQueryTerm(term)) {
      const prefix = `${term.table.tableName}/${term.column.getName()}`
      const pairs = flattenJson(term.contains, prefix)
      const svEntries: Array<Record<string, unknown>> = []

      for (const _pair of pairs) {
        const selectorEncrypted = selectorsEncrypted[jsonIdx]
        svEntries.push({
          ...jsonEncrypted[jsonIdx],
          s: selectorEncrypted ? (selectorEncrypted as any).s : undefined,
        })
        jsonIdx++
      }

      results[i] = { sv: svEntries } as Encrypted
    } else if (isJsonContainedByQueryTerm(term)) {
      const prefix = `${term.table.tableName}/${term.column.getName()}`
      const pairs = flattenJson(term.containedBy, prefix)
      const svEntries: Array<Record<string, unknown>> = []

      for (const _pair of pairs) {
        const selectorEncrypted = selectorsEncrypted[jsonIdx]
        svEntries.push({
          ...jsonEncrypted[jsonIdx],
          s: selectorEncrypted ? (selectorEncrypted as any).s : undefined,
        })
        jsonIdx++
      }

      results[i] = { sv: svEntries } as Encrypted
    } else if (isJsonPathQueryTerm(term)) {
      const prefix = `${term.table.tableName}/${term.column.getName()}`

      if (term.value !== undefined) {
        const selectorEncrypted = selectorsEncrypted[jsonIdx]
        results[i] = {
          ...jsonEncrypted[jsonIdx],
          s: selectorEncrypted ? (selectorEncrypted as any).s : undefined,
        } as Encrypted
        jsonIdx++
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
      }),
    )
  }
}