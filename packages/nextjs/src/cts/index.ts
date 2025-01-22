import { NextResponse } from 'next/server'
import { logger } from '../../../utils/logger'
import { CS_COOKIE_NAME, type CtsToken } from '../index'

export const setCtsToken = async (oidcToken: string, res?: NextResponse) => {
  const workspaceId = process.env.CS_WORKSPACE_ID

  if (!workspaceId) {
    logger.error(
      'The "CS_WORKSPACE_ID" environment variable is not set, and is required by jseqlClerkMiddleware. No CipherStash session will be set.',
    )

    return res ?? NextResponse.next()
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

    return res ?? NextResponse.next()
  }

  const cts_token = (await ctsResponse.json()) as CtsToken

  // Setting cookies on the request and response using the `ResponseCookies` API
  const response = res ?? NextResponse.next()
  response.cookies.set({
    name: CS_COOKIE_NAME,
    value: JSON.stringify(cts_token),
    expires: new Date(cts_token.expiry * 1000),
    sameSite: 'lax',
    path: '/',
  })

  return response
}
