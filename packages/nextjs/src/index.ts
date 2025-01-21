import { cookies } from 'next/headers'
import { logger } from '../../utils/logger'

export const CS_COOKIE_NAME = '__cipherstash_cts_session'

export type CtsToken = {
  accessToken: string
  expiry: number
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
