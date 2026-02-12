import { type Result, withResult } from '@byteslice/result'
import type { EncryptionClient, SearchTerm } from '@cipherstash/stack'
import { handleError } from '../helpers'
import type { EncryptedDynamoDBError } from '../types'
import {
  DynamoDBOperation,
  type DynamoDBOperationOptions,
} from './base-operation'

/**
 * @deprecated Use `encryptionClient.encryptQuery(terms)` instead and extract the `hm` field for DynamoDB key lookups.
 *
 * @example
 * ```typescript
 * // Before (deprecated)
 * const result = await protectDynamo.createSearchTerms([{ value, column, table }])
 * const hmac = result.data[0]
 *
 * // After (new API)
 * const [encrypted] = await encryptionClient.encryptQuery([{ value, column, table, queryType: 'equality' }])
 * const hmac = encrypted.hm
 * ```
 */
export class SearchTermsOperation extends DynamoDBOperation<string[]> {
  private encryptionClient: EncryptionClient
  private terms: SearchTerm[]

  constructor(
    encryptionClient: EncryptionClient,
    terms: SearchTerm[],
    options?: DynamoDBOperationOptions,
  ) {
    super(options)
    this.encryptionClient = encryptionClient
    this.terms = terms
  }

  public async execute(): Promise<Result<string[], EncryptedDynamoDBError>> {
    return await withResult(
      async () => {
        const searchTermsResult = await this.encryptionClient
          .createSearchTerms(this.terms)
          .audit(this.getAuditData())

        if (searchTermsResult.failure) {
          throw new Error(`[encryption]: ${searchTermsResult.failure.message}`)
        }

        return searchTermsResult.data.map((term) => {
          if (typeof term === 'string') {
            throw new Error(
              'expected encrypted search term to be an EncryptedPayload',
            )
          }

          if (!term?.hm) {
            throw new Error('expected encrypted search term to have an HMAC')
          }

          return term.hm
        })
      },
      (error) =>
        handleError(error, 'createSearchTerms', {
          logger: this.logger,
          errorHandler: this.errorHandler,
        }),
    )
  }
}
