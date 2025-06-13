import { withResult, type Result } from '@byteslice/result'
import type { ProtectClient, SearchTerm } from '@cipherstash/protect'
import { handleError } from '../helpers'
import type { ProtectDynamoDBError } from '../types'
import {
  DynamoDBOperation,
  type DynamoDBOperationOptions,
} from './base-operation'

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

  public async execute(): Promise<Result<string[], ProtectDynamoDBError>> {
    return await withResult(
      async () => {
        const operation = this.protectClient.createSearchTerms(this.terms)

        // Apply audit metadata if it exists
        const auditMetadata = this.getAuditMetadata()
        if (auditMetadata) {
          operation.audit({ metadata: auditMetadata })
        }

        const searchTermsResult = await operation

        if (searchTermsResult.failure) {
          throw new Error(`[protect]: ${searchTermsResult.failure.message}`)
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
