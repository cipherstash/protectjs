import { type Result, withResult } from '@byteslice/result'
import { encryptBulk } from '@cipherstash/protect-ffi'
import { type EncryptionError, EncryptionErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { Client, EncryptedSearchTerm, SearchTerm } from '../../types'
import { noClientError } from '../index'
import { EncryptionOperation } from './base-operation'

export class SearchTermsOperation extends EncryptionOperation<
  EncryptedSearchTerm[]
> {
  private client: Client
  private terms: SearchTerm[]

  constructor(client: Client, terms: SearchTerm[]) {
    super()
    this.client = client
    this.terms = terms
  }

  public async execute(): Promise<
    Result<EncryptedSearchTerm[], EncryptionError>
  > {
    logger.debug('Creating search terms', {
      terms: this.terms,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        const { metadata } = this.getAuditData()

        const encryptedSearchTerms = await encryptBulk(this.client, {
          plaintexts: this.terms.map((term) => ({
            plaintext: term.value,
            column: term.column.getName(),
            table: term.table.tableName,
          })),
          unverifiedContext: metadata,
        })

        return this.terms.map((term, index) => {
          if (term.returnType === 'composite-literal') {
            return `(${JSON.stringify(JSON.stringify(encryptedSearchTerms[index]))})`
          }

          if (term.returnType === 'escaped-composite-literal') {
            return `${JSON.stringify(`(${JSON.stringify(JSON.stringify(encryptedSearchTerms[index]))})`)}`
          }

          return encryptedSearchTerms[index]
        })
      },
      (error) => ({
        type: EncryptionErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}
