---
"@cipherstash/stack": patch
---

perf(drizzle): wrap `like` / `ilike` / `notIlike` in `eql_v2.bloom_filter(...) @> eql_v2.bloom_filter(...)` so encrypted free-text searches engage the bloom_filter functional GIN index on Supabase and any `--exclude-operator-family` install. Previously the operators emitted `eql_v2.like(col, value)` / `eql_v2.ilike(col, value)` — the function bodies contain the inlinable bloom-filter form, but they're marked `VOLATILE` so the planner can't inline them, and the documented `bench_text_bloom_idx` GIN index never engages. Drizzle now emits the inlined form directly.
