import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

type JseqlMiddlewareConfig = {
  sessionCookieName: string
}

export async function jseqlMiddleware(config: JseqlMiddlewareConfig) {
  return async (req: NextRequest) => {
    const cookie = req.cookies.get(config.sessionCookieName)

    if (cookie) {
      const token = cookie.value

      if (!token) {
        throw new Error(
          '[ Server ] jseql: No session token found in the request.',
        )
      }

      // TODO: CTS token exchange
      const cts_token = token

      const response = NextResponse.next()
      response.cookies.set({
        name: '__cipherstash_cts_token',
        value: cts_token,
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        path: '/',
      })

      return response
    }
  }
}
