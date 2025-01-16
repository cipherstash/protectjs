import type { ClerkMiddlewareAuth } from '@clerk/nextjs/server'
import { getLogger } from '@logtape/logtape'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { CS_COOKIE_NAME } from '../index'
import type { CtsToken } from '@cipherstash/jseql'

const logger = getLogger(['jseql'])

export const jseqlClerkMiddleware = async (
  auth: ClerkMiddlewareAuth,
  req: NextRequest,
) => {
  const { userId, getToken } = await auth()

  if (userId) {
    const oidcToken = await getToken()

    if (!oidcToken) {
      logger.debug(
        'No Clerk token found in the request, so the CipherStash session was not set.',
      )

      return NextResponse.next()
    }

    const workspaceId = process.env.CS_WORKSPACE_ID

    if (!workspaceId) {
      const errorMessage =
        'CS_WORKSPACE_ID environment variable is not set, and is required by jseqlClerkMiddleware.'
      logger.error(errorMessage)
      throw new Error(`[ Server ] jseql: ${errorMessage}`)
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
      throw new Error(
        `[ Server ] jseql: Failed to fetch CTS token: ${ctsResponse.statusText}`,
      )
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

    const cookie = response.cookies.get(CS_COOKIE_NAME)
    return response
  }

  logger.debug(
    'No Clerk token found in the request, so the CipherStash session was not set.',
  )

  return NextResponse.next()
}
