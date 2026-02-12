
# Locking context with Next.js and Clerk

This how-to guide shows you how to use lock context if you're using [Clerk](https://clerk.com/) with Next.js.

## Table of contents

- [Getting started](#getting-started)
- [Retrieving the CTS token in Next.js](#retrieving-the-cts-token-in-nextjs)
- [Constructing a LockContext with an existing CTS token](#constructing-a-lockcontext-with-an-existing-cts-token)
- [Custom lock contexts](#custom-lock-contexts)

## Getting started

If you're using [Clerk](https://clerk.com/) as your identity provider, use the `protectClerkMiddleware` function to automatically set the CTS token for every user session.

Install the `@cipherstash/nextjs` package:

```bash
npm install @cipherstash/nextjs
# or
yarn add @cipherstash/nextjs
# or
pnpm add @cipherstash/nextjs
```

In your `middleware.ts` file, add the following code:

```typescript
import { clerkMiddleware } from '@clerk/nextjs/server'
import { protectClerkMiddleware } from '@cipherstash/nextjs/clerk'

export default clerkMiddleware(async (auth, req: NextRequest) => {
  return protectClerkMiddleware(auth, req)
})
```

## Retrieving the CTS token in Next.js

You can then use the `getCtsToken` function to retrieve the CTS token for the current user session.

```typescript
import { getCtsToken } from '@cipherstash/nextjs'

export default async function Page() {
  const ctsToken = await getCtsToken()

  // getCtsToken returns either
  // ---
  // { success: true, ctsToken: CtsToken }
  // or
  // { success: false, error: string }

  if (!ctsToken.success) {
    // handle error
  }

  return (
    <div>
      <h1>Server side rendered page</h1>
    </div>
  )
}
```

## Constructing a LockContext with an existing CTS token

Since the CTS token is already available, you can construct a `LockContext` object with the existing CTS token.

```typescript
import { LockContext } from '@cipherstash/stack/identity'
import { getCtsToken } from '@cipherstash/nextjs'

export default async function Page() {
  const ctsToken = await getCtsToken()

  if (!ctsToken.success) {
    // handle error
  }

  const lockContext = new LockContext({
    ctsToken
  })

  return (
    <div>
      <h1>Server side rendered page</h1>
    </div>
  )
}
```

## Custom lock contexts

If you want to override the default context, you can pass a custom context to the `LockContext` constructor.

```typescript
import { LockContext } from '@cipherstash/stack/identity'

// encryptionClient from the previous steps
const lc = new LockContext({
  context: {
    identityClaim: ['sub'], // this is the default context
  },
})
```

**Context and identity claim options**

The context object contains an `identityClaim` property.
The `identityClaim` property must be an array of strings that correspond to the Identity Claim(s) you want to lock the encryption operation to.

Currently supported Identity Claims are:

| Identity Claim | Description |
| -------------- | ----------- |
| `sub`          | The user's subject identifier. |
| `scopes`       | The user's scopes set by your IDP policy. |

---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%lock-contexts-with-clerk.md)
