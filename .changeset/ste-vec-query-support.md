---
"@cipherstash/protect": minor
"@cipherstash/schema": minor
"@cipherstash/stack": minor
---

Add encrypted JSONB query support with `searchableJson()` (recommended).

- New `searchableJson()` schema method enables encrypted JSONB path and containment queries
- Automatic query operation inference: string values become JSONPath selector queries, objects/arrays become containment queries
- Also supports explicit `queryType: 'steVecSelector'` and `queryType: 'steVecTerm'` for advanced use cases
- JSONB path utilities (`toJsonPath`, `buildNestedObject`, `parseJsonbPath`) for building encrypted JSON column queries
