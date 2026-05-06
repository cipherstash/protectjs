---
"@cipherstash/stack": patch
---

perf(drizzle): wrap `eq` / `ne` / `inArray` / `notInArray` in `eql_v2.hmac_256(...)` so encrypted equality lookups engage the hmac_256 functional hash index on Supabase and any `--exclude-operator-family` install. Previously the operators emitted bare `col = value` SQL that only matched the `eql_v2.encrypted_operator_class` btree index, which doesn't exist on those deployments — so every encrypted equality lookup silently fell back to a sequential scan.
