# Protect.js + Next.js + Clerk example

This example demonstrates how to use Protect.js with Next.js. It also demonstrates how to use Lock Contexts to ensure that only the intended users can access sensitive data, by using Clerk for authentication.

This project uses the following technologies:

- [pnpm](https://pnpm.io) for package management
- [Next.js](https://nextjs.org) for the application framework
- [Clerk](https://clerk.com) for auth
- [Supabase](https://supabase.com) for database
- [Drizzle ORM](https://drizzle.org) for database access
- [CipherStash](https://cipherstash.com) for data encryption

## Getting Started

First, install dependencies:

```bash
pnpm install
```

Second, create a `.env.local` file in the root directory with the following content:

```bash
# Clerk auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Supabase postgres connection string
POSTGRES_URL=

# CipherStash encryption and access keys
CS_CLIENT_ID=
CS_CLIENT_KEY=
CS_CLIENT_ACCESS_KEY=
CS_WORKSPACE_ID=
```

Finally, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database

The database is hosted on Supabase and has the following schema which is defined using the Drizzle ORM:

```ts
// Data that is encrypted using protect.js is stored as jsonb in postgres

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  email: jsonb("email").notNull(),
  role: varchar("role").notNull(),
});
```

> [!NOTE]
> This example does not include any searchable encrypted fields.
> If you want to search on encrypted fields, you will need to install EQL.
> The EQL library ships with custom types that are used to define encrypted fields.
> See the [EQL documentation](https://github.com/cipherstash/encrypted-query-language) for more information.

## @cipherstash/protect

All the email data is encrypted using Protect.js.
The cipherstext is stored in the `email` column of the `users` table.
The application is configured to only decrypt the data when the user is signed in, otherwise it will display the encrypted data.

### Npm package

`@cipherstash/protect` uses custom Rust bindings to the CipherStash Client in order to perform encryptions and decryptions.
We leverage the [Neon project](https://neon-rs.dev/) to provide a JavaScript API for these bindings.

### Encryption

When a user is added to the database, the email address is encrypted using Protect.js.
To view the encryption implementation, see the `addUser` function in [src/lib/actions.ts](src/lib/actions.ts).

### Decryption

To view the decrpytion implementation, see the `getUsers` function in [src/app/page.tsx](src/app/page.tsx).

### Next.js

Since `@cipherstash/protect` is a native Node.js module, you need to opt-out from the Server Components bundling and use native Node.js `require` instead.

#### Using version 15 or later

`next.config.ts` [configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages):

```js
const nextConfig = {
  ...
  serverExternalPackages: ['@cipherstash/protect'],
}
```

#### Using version 14

`next.config.mjs` [configuration](https://nextjs.org/docs/14/app/api-reference/next-config-js/serverComponentsExternalPackages):

```js
const nextConfig = {
  ...
  experimental: {
    serverComponentsExternalPackages: ['@cipherstash/protect'],
  },
}
```

#### Workspace package issue

`serverExternalPackages` does not work with workspace packages and the issues is being tracked [here](https://github.com/vercel/next.js/issues/43433).

Once this is fixed upstream, this application can use the workspace package for development.
For the time being, it used `@cipherstash/protect` from the npm registry.