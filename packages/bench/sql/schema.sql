-- Bench fixture schema.
-- Single bench table covering text / int / jsonb encrypted columns plus the
-- three canonical EQL functional indexes: hmac_256 (hash), bloom_filter (GIN),
-- ste_vec (GIN).
--
-- We deliberately do NOT create the `eql_v2.encrypted_operator_class` btree
-- indexes that ore-benches uses. Encrypted composites for full-feature columns
-- (equality + match + ORE) blow past the 2704-byte btree page-size limit, and
-- those indexes don't exist on Supabase anyway — the bench's whole job is to
-- validate that the functional-index path works.

DROP TABLE IF EXISTS bench;

CREATE TABLE bench (
    id        SERIAL PRIMARY KEY,
    enc_text  eql_v2_encrypted NOT NULL,
    enc_int   eql_v2_encrypted NOT NULL,
    enc_jsonb eql_v2_encrypted NOT NULL
);

CREATE INDEX bench_text_hmac_idx
    ON bench USING hash (eql_v2.hmac_256(enc_text));

CREATE INDEX bench_text_bloom_idx
    ON bench USING gin  (eql_v2.bloom_filter(enc_text));

CREATE INDEX bench_jsonb_stevec_idx
    ON bench USING gin  (eql_v2.ste_vec(enc_jsonb));

ANALYZE bench;
