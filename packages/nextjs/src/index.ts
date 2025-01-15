import { cookies } from 'next/headers'
import { getLogger } from '@logtape/logtape'
import type { CtsToken } from '@cipherstash/jseql'

const logger = getLogger(['jseql'])
export const CS_COOKIE_NAME = '__cipherstash_cts_session'

export const getCtsToken = async () => {
  const cookieStore = await cookies()
  const cookieData = cookieStore.get(CS_COOKIE_NAME)?.value

  if (!cookieData) {
    logger.debug('No CipherStash session cookie found in the request.')
    return null
  }

  const cts_token = JSON.parse(cookieData) as CtsToken
  return cts_token
}
