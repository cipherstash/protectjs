---
"@cipherstash/stack": patch
---

Bundle `evlog` into the CJS output. `evlog` is pure ESM (no `require` condition in its `exports` map), so CJS consumers of `@cipherstash/stack` (e.g. webpack bundles) were failing with `ERR_PACKAGE_PATH_NOT_EXPORTED` when the stack's `index.cjs` tried to `require("evlog")`. `evlog` is now inlined at build time and no longer resolved at runtime.
