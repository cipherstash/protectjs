import { type Result, withResult } from '@byteslice/result'
import {
  type JsPlaintext,
  encryptBulk,
  encryptQuery as ffiEncryptQuery,
} from '@cipherstash/protect-ffi'
import type {
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
  ProtectValue,
} from '@cipherstash/schema'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type {
  Client,
  EncryptQueryOptions,
  Encrypted,
  QueryTypeName,
  QueryOpName,
} from '../../types'
import { queryTypeToFfi } from '../../types'
import { noClientError } from '../index'
import { ProtectOperation } from './base-operation'

/**
 * @internal
 * Operation for encrypting a single query term.
 * When queryType is provided, uses explicit query type control via ffiEncryptQuery.
 * When queryType is omitted, auto-infers from column config via encryptBulk.
 * See {@link ProtectClient.encryptQuery} for the public interface and documentation.
 */
export class EncryptQueryOperation extends ProtectOperation<Encrypted> {
  private client: Client
  private plaintext: JsPlaintext | null
  private column: ProtectColumn | ProtectValue
  private table: ProtectTable<ProtectTableColumn>
  private queryType?: QueryTypeName
  private queryOp?: QueryOpName

  constructor(
    client: Client,
    plaintext: JsPlaintext | null,
    opts: EncryptQueryOptions,
  ) {
    super()
    this.client = client
    this.plaintext = plaintext
    this.column = opts.column
    this.table = opts.table
    this.queryType = opts.queryType
    this.queryOp = opts.queryOp
  }

  public async execute(): Promise<Result<Encrypted, ProtectError>> {
    logger.debug('Encrypting query', {
      column: this.column.getName(),
      table: this.table.tableName,
      queryType: this.queryType,
      queryOp: this.queryOp,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (this.plaintext === null) {
          return null
        }

        const { metadata } = this.getAuditData()

        // Use explicit query type if provided, otherwise auto-infer via encryptBulk
        if (this.queryType !== undefined) {
          return await ffiEncryptQuery(this.client, {
            plaintext: this.plaintext,
            column: this.column.getName(),
            table: this.table.tableName,
            indexType: queryTypeToFfi[this.queryType],
            queryOp: this.queryOp,
            unverifiedContext: metadata,
          })
        }

        // Auto-infer query type via encryptBulk
        const results = await encryptBulk(this.client, {
          plaintexts: [
            {
              plaintext: this.plaintext,
              column: this.column.getName(),
              table: this.table.tableName,
            },
          ],
          unverifiedContext: metadata,
        })
        return results[0]
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    plaintext: JsPlaintext | null
    column: ProtectColumn | ProtectValue
    table: ProtectTable<ProtectTableColumn>
    queryType?: QueryTypeName
    queryOp?: QueryOpName
  } {
    return {
      client: this.client,
      plaintext: this.plaintext,
      column: this.column,
      table: this.table,
      queryType: this.queryType,
      queryOp: this.queryOp,
    }
  }
}