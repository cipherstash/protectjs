# Next.js

Using `@cipherstash/stack` with Next.js? You need to opt-out from the Server Components bundling and use native Node.js `require` instead.

## Using version 15 or later

`next.config.ts` [configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages):

```js
const nextConfig = {
  ...
  serverExternalPackages: ['@cipherstash/stack'],
}
```

## Using version 14

`next.config.mjs` [configuration](https://nextjs.org/docs/14/app/api-reference/next-config-js/serverComponentsExternalPackages):

```js
const nextConfig = {
  ...
  experimental: {
    serverComponentsExternalPackages: ['@cipherstash/stack'],
  },
}
```

---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%nextjs-external-packages.md)
