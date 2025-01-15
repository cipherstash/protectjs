import { cookies } from 'next/headers'
import { getLogger } from '@logtape/logtape'

const logger = getLogger(['jseql'])
export const CS_COOKIE_NAME = '__cipherstash_cts_session'

export type CtsToken = {
  access_token: string
  expires: Date
}

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
