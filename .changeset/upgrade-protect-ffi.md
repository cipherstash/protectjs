---
"@cipherstash/protect": minor
"@cipherstash/stack": minor
"@cipherstash/schema": minor
"@cipherstash/drizzle": patch
---

Upgrade protect-ffi to 0.21.0 and enable array_index_mode for searchable JSON

- Upgrade `@cipherstash/protect-ffi` to 0.21.0 across all packages
- Enable `array_index_mode: 'all'` on STE vec indexes so JSON array operations
  (jsonb_array_elements, jsonb_array_length, array containment) work correctly
- Delegate credential resolution entirely to protect-ffi's `withEnvCredentials`
- Download latest EQL at build/runtime instead of bundling hardcoded SQL files
