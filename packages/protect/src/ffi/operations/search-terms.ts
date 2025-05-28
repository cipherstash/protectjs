import { encryptBulk } from '@cipherstash/protect-ffi'
import { withResult, type Result } from '@byteslice/result'
import { noClientError } from '../index'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { Client, EncryptedSearchTerm, SearchTerm } from '../../types'

export class SearchTermsOperation {
  private client: Client
  private terms: SearchTerm[]

  constructor(client: Client, terms: SearchTerm[]) {
    this.client = client
    this.terms = terms
  }

  public async execute(): Promise<Result<EncryptedSearchTerm[], ProtectError>> {
    logger.debug('Creating search terms', {
      terms: this.terms,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        const encryptedSearchTerms = await encryptBulk(
          this.client,
          this.terms.map((term) => ({
            plaintext: term.value,
            column: term.column.getName(),
            table: term.table.tableName,
          })),
        )

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
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}
