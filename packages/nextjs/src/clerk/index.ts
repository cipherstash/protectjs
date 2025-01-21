import type { ClerkMiddlewareAuth } from '@clerk/nextjs/server'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { CS_COOKIE_NAME, type CtsToken } from '../index'
import { logger } from '../../../utils/logger'

export const jseqlClerkMiddleware = async (
  auth: ClerkMiddlewareAuth,
  req: NextRequest,
) => {
  const { userId, getToken } = await auth()
  const ctsSession = req.cookies.has(CS_COOKIE_NAME)

  if (userId && !ctsSession) {
    const oidcToken = await getToken()

    if (!oidcToken) {
      logger.debug(
        'No Clerk token found in the request, so the CipherStash session was not set.',
      )

      return NextResponse.next()
    }

    const workspaceId = process.env.CS_WORKSPACE_ID

    if (!workspaceId) {
      logger.error(
        'The "CS_WORKSPACE_ID" environment variable is not set, and is required by jseqlClerkMiddleware. No CipherStash session will be set.',
      )

      return NextResponse.next()
    }

    const ctsEndoint =
      process.env.CS_CTS_ENDPOINT ||
      'https://ap-southeast-2.aws.auth.viturhosted.net'

    const ctsResponse = await fetch(`${ctsEndoint}/api/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workspaceId,
        oidcToken,
      }),
    })

    if (!ctsResponse.ok) {
      logger.debug(`Failed to fetch CTS token: ${ctsResponse.statusText}`)

      logger.error(
        'There was an issue communicating with the CipherStash CTS API, the CipherStash session was not set. If the issue persists, please contact support.',
      )

      return NextResponse.next()
    }

    const cts_token = (await ctsResponse.json()) as CtsToken

    // Setting cookies on the request and response using the `ResponseCookies` API
    const response = NextResponse.next()
    response.cookies.set({
      name: CS_COOKIE_NAME,
      value: JSON.stringify(cts_token),
      expires: new Date(cts_token.expiry * 1000),
      sameSite: 'lax',
      path: '/',
    })

    response.cookies.get(CS_COOKIE_NAME)
    return response
  }

  if (!userId && ctsSession) {
    logger.debug(
      'No Clerk token found in the request, so the CipherStash session was reset.',
    )

    const response = NextResponse.next()
    response.cookies.delete(CS_COOKIE_NAME)
    return response
  }

  logger.debug(
    'No Clerk token found in the request, so the CipherStash session was not set.',
  )

  return NextResponse.next()
}
