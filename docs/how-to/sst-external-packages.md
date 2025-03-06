## SST and esbuild

Using `@cipherstash/protect` in a serverless function deployed with [SST](https://sst.dev/)?

You need to configure the `nodejs.esbuild.external` and `nodejs.install` options in your `sst.config.ts` file as documented [here](https://sst.dev/docs/component/aws/function/#nodejs):

```ts
...
nodejs: {
  esbuild: {
    external: ['@cipherstash/protect'],
  },
  install: ['@cipherstash/protect'],
},
...
```