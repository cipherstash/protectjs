export * from './cs_encrypted_v1'
import type { CsEncryptedV1Schema } from './cs_encrypted_v1'
import { getLogger } from '@logtape/logtape'

const logger = getLogger(['jseql'])

type CreateEqlPayload = {
  plaintext: string | undefined
  table: string
  column: string
  version?: number
  schemaVersion?: number
  queryType?: string | null
}

export const createEqlPayload = ({
  plaintext,
  table,
  column,
  version = 1,
  queryType = null,
}: CreateEqlPayload): CsEncryptedV1Schema => {
  const payload: CsEncryptedV1Schema = {
    v: version,
    s: 1,
    k: 'pt',
    p: plaintext ?? '',
    i: {
      t: table,
      c: column,
    },
    q: queryType,
  }

  logger.debug('Creating the EQL payload', payload)
  return payload
}

export const getPlaintext = (
  payload: CsEncryptedV1Schema | null,
): string | undefined => {
  if (payload?.k === 'pt') {
    logger.debug('Returning the plaintext data from the EQL payload', payload)
    return payload.p
  }

  logger.error('No plaintext data found in the EQL payload', payload ?? {})
  return undefined
}
