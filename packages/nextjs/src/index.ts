import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { setCtsToken } from './cts'
import { logger } from '../../utils/logger'

export const CS_COOKIE_NAME = '__cipherstash_cts_session'

export type CtsToken = {
  accessToken: string
  expiry: number
}

type GetCtsTokenResponse = Promise<
  | {
      success: boolean
      error: string
      ctsToken?: never
    }
  | {
      success: boolean
      error?: never
      ctsToken: CtsToken
    }
>

export const getCtsToken = async (): GetCtsTokenResponse => {
  const cookieStore = await cookies()
  const cookieData = cookieStore.get(CS_COOKIE_NAME)?.value

  if (!cookieData) {
    logger.debug('No CipherStash session cookie found in the request.')
    return {
      success: false,
      error: 'No CipherStash session cookie found in the request.',
    }
  }

  const cts_token = JSON.parse(cookieData) as CtsToken
  return {
    success: true,
    ctsToken: cts_token,
  }
}

export const resetCtsToken = (res?: NextResponse) => {
  if (res) {
    res.cookies.delete(CS_COOKIE_NAME)
    return res
  }

  const response = NextResponse.next()
  response.cookies.delete(CS_COOKIE_NAME)
  return response
}

export const jseqlMiddleware = async (
  oidcToken: string,
  req: NextRequest,
  res?: NextResponse,
) => {
  const ctsSession = req.cookies.has(CS_COOKIE_NAME)

  if (oidcToken && !ctsSession) {
    return await setCtsToken(oidcToken, res)
  }

  if (!oidcToken && ctsSession) {
    logger.debug(
      'The JWT token was undefined, so the CipherStash session was reset.',
    )

    return resetCtsToken(res)
  }

  logger.debug(
    'The JWT token was undefined, so the CipherStash session was not set.',
  )

  if (res) {
    return res
  }

  return NextResponse.next()
}
