---
"@cipherstash/protect": minor
"@cipherstash/schema": minor
---

Add STE Vec query support to encryptQuery API for encrypted JSONB columns.

- New `searchableJson()` method on column schema enables encrypted JSONB queries
- Automatic query operation inference from plaintext shape (string → steVecSelector, object/array → steVecTerm)
- Supports explicit `queryType: 'steVecSelector'` and `queryType: 'steVecTerm'` options
- JSONB path utilities for building encrypted JSON column queries
