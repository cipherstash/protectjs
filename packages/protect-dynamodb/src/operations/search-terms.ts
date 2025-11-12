import { type Result, withResult } from '@byteslice/result'
import type { ProtectClient, SearchTerm } from '@cipherstash/protect'
import { handleError } from '../helpers'
import type { ProtectDynamoDBError } from '../types'
import {
  DynamoDBOperation,
  type DynamoDBOperationOptions,
} from './base-operation'

/**
 * DynamoDB helper that converts Protect search terms into HMAC strings usable
 * in DynamoDB indexes.
 */
export class SearchTermsOperation extends DynamoDBOperation<string[]> {
  private protectClient: ProtectClient
  private terms: SearchTerm[]

  constructor(
    protectClient: ProtectClient,
    terms: SearchTerm[],
    options?: DynamoDBOperationOptions,
  ) {
    super(options)
    this.protectClient = protectClient
    this.terms = terms
  }

  /**
   * Execute the search-term generation and extract the DynamoDB-ready HMAC
   * values, raising structured errors on invalid payloads.
   */
  public async execute(): Promise<Result<string[], ProtectDynamoDBError>> {
    return await withResult(
      async () => {
        const searchTermsResult = await this.protectClient
          .createSearchTerms(this.terms)
          .audit(this.getAuditData())

        if (searchTermsResult.failure) {
          throw new Error(`[protect]: ${searchTermsResult.failure.message}`)
        }

        return searchTermsResult.data.map((term) => {
          if (typeof term === 'string') {
            throw new Error(
              'expected encrypted search term to be an EncryptedPayload',
            )
          }

          if (term?.k !== 'ct') {
            throw new Error(
              'Tried to create search term with an invalid encrypted payload',
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
