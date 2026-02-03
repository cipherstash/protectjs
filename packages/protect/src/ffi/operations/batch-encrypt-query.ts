import { type Result, withResult } from '@byteslice/result'
import {
  type JsPlaintext,
  encryptQueryBulk as ffiEncryptQueryBulk,
  type QueryPayload,
} from '@cipherstash/protect-ffi'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { Context, LockContext } from '../../identify'
import type { Client, Encrypted, ScalarQueryTerm } from '../../types'
import { queryTypeToFfi } from '../../types'
import { noClientError } from '../index'
import { ProtectOperation } from './base-operation'
import { inferIndexType, validateIndexType } from '../helpers/infer-index-type'

/**
 * Separates null values from non-null terms in the input array.
 * Returns a set of indices where values are null and an array of non-null terms with their original indices.
 */
function filterNullTerms(
  terms: readonly ScalarQueryTerm[],
): {
  nullIndices: Set<number>
  nonNullTerms: { term: ScalarQueryTerm; originalIndex: number }[]
} {
  const nullIndices = new Set<number>()
  const nonNullTerms: { term: ScalarQueryTerm; originalIndex: number }[] = []

  terms.forEach((term, index) => {
    if (term.value === null) {
      nullIndices.add(index)
    } else {
      nonNullTerms.push({ term, originalIndex: index })
    }
  })

  return { nullIndices, nonNullTerms }
}

/**
 * Validates and transforms a single term into a QueryPayload.
 * Throws an error if the value is NaN or Infinity.
 * Optionally includes lockContext if provided.
 */
function buildQueryPayload(
  term: ScalarQueryTerm,
  lockContext?: Context,
): QueryPayload {
  if (typeof term.value === 'number' && Number.isNaN(term.value)) {
    throw new Error('[protect]: Cannot encrypt NaN value')
  }

  if (typeof term.value === 'number' && !Number.isFinite(term.value)) {
    throw new Error('[protect]: Cannot encrypt Infinity value')
  }

  const indexType = term.queryType
    ? queryTypeToFfi[term.queryType]
    : inferIndexType(term.column)

  if (term.queryType) {
    validateIndexType(term.column, indexType)
  }

  const payload: QueryPayload = {
    plaintext: term.value as JsPlaintext,
    column: term.column.getName(),
    table: term.table.tableName,
    indexType,
  }

  if (lockContext !== undefined) {
    payload.lockContext = lockContext
  }

  return payload
}

/**
 * Reconstructs the results array with nulls in their original positions.
 * Non-null encrypted values are placed at their original indices.
 */
function assembleResults(
  totalLength: number,
  nullIndices: Set<number>,
  encryptedValues: Encrypted[],
  nonNullTerms: { term: ScalarQueryTerm; originalIndex: number }[],
): Encrypted[] {
  const results: Encrypted[] = new Array(totalLength)

  // Set null positions
  for (let i = 0; i < totalLength; i++) {
    if (nullIndices.has(i)) {
      results[i] = null
    }
  }

  // Fill in encrypted values at their original positions
  nonNullTerms.forEach(({ originalIndex }, i) => {
    results[originalIndex] = encryptedValues[i]
  })

  return results
}

/**
 * @internal Use {@link ProtectClient.encryptQuery} with array input instead.
 */
export class BatchEncryptQueryOperation extends ProtectOperation<Encrypted[]> {
  constructor(
    private client: Client,
    private terms: readonly ScalarQueryTerm[],
  ) {
    super()
  }

  public withLockContext(lockContext: LockContext): BatchEncryptQueryOperationWithLockContext {
    return new BatchEncryptQueryOperationWithLockContext(this.client, this.terms, lockContext, this.auditMetadata)
  }

  public async execute(): Promise<Result<Encrypted[], ProtectError>> {
    logger.debug('Encrypting query terms', { count: this.terms.length })

    if (this.terms.length === 0) {
      return { data: [] }
    }

    const { nullIndices, nonNullTerms } = filterNullTerms(this.terms)

    if (nonNullTerms.length === 0) {
      return { data: this.terms.map(() => null) }
    }

    return await withResult(
      async () => {
        if (!this.client) throw noClientError()

        const { metadata } = this.getAuditData()

        const queries: QueryPayload[] = nonNullTerms.map(({ term }) => buildQueryPayload(term))

        const encrypted = await ffiEncryptQueryBulk(this.client, {
          queries,
          unverifiedContext: metadata,
        })

        return assembleResults(this.terms.length, nullIndices, encrypted, nonNullTerms)
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}

/**
 * @internal Use {@link ProtectClient.encryptQuery} with array input and `.withLockContext()` instead.
 */
export class BatchEncryptQueryOperationWithLockContext extends ProtectOperation<Encrypted[]> {
  constructor(
    private client: Client,
    private terms: readonly ScalarQueryTerm[],
    private lockContext: LockContext,
    auditMetadata?: Record<string, unknown>,
  ) {
    super()
    this.auditMetadata = auditMetadata
  }

  public async execute(): Promise<Result<Encrypted[], ProtectError>> {
    logger.debug('Encrypting query terms with lock context', { count: this.terms.length })

    if (this.terms.length === 0) {
      return { data: [] }
    }

    // Check for all-null terms BEFORE fetching lockContext to avoid unnecessary network call
    const { nullIndices, nonNullTerms } = filterNullTerms(this.terms)

    if (nonNullTerms.length === 0) {
      return { data: this.terms.map(() => null) }
    }

    const lockContextResult = await this.lockContext.getLockContext()
    if (lockContextResult.failure) {
      return { failure: lockContextResult.failure }
    }

    const { ctsToken, context } = lockContextResult.data

    return await withResult(
      async () => {
        if (!this.client) throw noClientError()

        const { metadata } = this.getAuditData()

        const queries: QueryPayload[] = nonNullTerms.map(({ term }) => buildQueryPayload(term, context))

        const encrypted = await ffiEncryptQueryBulk(this.client, {
          queries,
          serviceToken: ctsToken,
          unverifiedContext: metadata,
        })

        return assembleResults(this.terms.length, nullIndices, encrypted, nonNullTerms)
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}
