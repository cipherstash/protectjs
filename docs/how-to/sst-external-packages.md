# SST and esbuild

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

---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%sst-external-packages.md)
