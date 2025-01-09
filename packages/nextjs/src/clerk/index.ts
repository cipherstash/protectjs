import type { ClerkMiddlewareAuth } from '@clerk/nextjs/server'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Usage in middleware.ts
// -----
// import { clerkMiddleware } from '@clerk/nextjs/server'
// import { jseqlClerkMiddleware } from '@cipherstash/nextjs/clerk'
//
// export default clerkMiddleware(async (auth, req: NextRequest) => {
//   return jseqlClerkMiddleware(auth, req)
// })

export async function jseqlClerkMiddleware(
  auth: ClerkMiddlewareAuth,
  req: NextRequest,
) {
  const { userId, getToken } = await auth()
  console.log('[ Server ] jseql: Clerk userId', userId)

  if (userId) {
    console.log('[ Server ] jseql: Clerk user found.')
    const token = await getToken()

    if (!token) {
      throw new Error('[ Server ] jseql: No Clerk token found in the request.')
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

    console.log('[ Server ] jseql: Clerk token set as cookie.')

    return response
  }
}
