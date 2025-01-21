import type {
  CsPlaintextV1Schema,
  ForQuery,
  SchemaVersion,
  Table,
  Column,
  Plaintext,
} from '../cs_plaintext_v1'
import { logger } from '../../../utils/logger'

export type CreateEqlPayload = {
  plaintext: Plaintext
  table: Table
  column: Column
  schemaVersion?: SchemaVersion
  queryType?: ForQuery | null
}

export type Result = {
  failure?: boolean
  error?: Error
  plaintext?: Plaintext
}

export const createEqlPayload = ({
  plaintext,
  table,
  column,
  schemaVersion = 1,
  queryType = null,
}: CreateEqlPayload): CsPlaintextV1Schema => {
  const payload: CsPlaintextV1Schema = {
    v: schemaVersion,
    k: 'pt',
    p: plaintext ?? '',
    i: {
      t: table,
      c: column,
    },
  }

  if (queryType) {
    payload.q = queryType
  }

  logger.debug('Creating the EQL payload', payload)
  return payload
}

export const getPlaintext = (payload: CsPlaintextV1Schema): Result => {
  if (payload?.p && payload?.k === 'pt') {
    logger.debug('Returning the plaintext data from the EQL payload', payload)
    return {
      failure: false,
      plaintext: payload.p,
    }
  }

  logger.error('No plaintext data found in the EQL payload', payload ?? {})
  return {
    failure: true,
    error: new Error('No plaintext data found in the EQL payload'),
  }
}
