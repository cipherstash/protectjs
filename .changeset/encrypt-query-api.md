---
"@cipherstash/protect": minor
"@cipherstash/drizzle": patch
---

Add `encryptQuery` API for encrypting query terms with explicit query type selection.

- New `encryptQuery()` method replaces `createSearchTerms()` with improved query type handling
- Supports `equality`, `freeTextSearch`, and `orderAndRange` query types
- Deprecates `createSearchTerms()` - use `encryptQuery()` instead
- Updates drizzle operators to use correct index selection via `queryType` parameter
