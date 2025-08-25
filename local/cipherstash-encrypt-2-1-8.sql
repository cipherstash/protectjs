DROP SCHEMA IF EXISTS eql_v2 CASCADE;
CREATE SCHEMA eql_v2;

-- eql_v2_encrypted is a column type
--  defined as jsonb for maximum portability of encrypted data
--  defined in the public schema as it cannot be dropped if in use
-- DO $$
--   BEGIN
--       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eql_v2_encrypted') THEN
--         CREATE DOMAIN public.eql_v2_encrypted AS jsonb;
--     END IF;
--   END
-- $$;


-- eql_v2.encrypted is an internal composite type
-- eql_v2_encrypted data is cast to eql_v2.encrypted for use in EQL functions

--
-- Create an eql_v2_encrypted type in the public schema
-- Public schema allows the EQL schema to be dropped and recreated without impacting the type
-- Customer data may be using this type for encrypted data
--
-- DO NOT DROP UNLESS ABSOLUTELY POSITIVE NO DATA IS USING IT
--
DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eql_v2_encrypted') THEN
      CREATE TYPE public.eql_v2_encrypted AS (
        data jsonb
      );
    END IF;
  END
$$;










CREATE DOMAIN eql_v2.bloom_filter AS smallint[];



CREATE TYPE eql_v2.ore_block_u64_8_256_term AS (
  bytes bytea
);


CREATE TYPE eql_v2.ore_block_u64_8_256 AS (
  terms eql_v2.ore_block_u64_8_256_term[]
);

CREATE DOMAIN eql_v2.hmac_256 AS text;
-- AUTOMATICALLY GENERATED FILE

-- Constant time comparison of 2 bytea values


CREATE FUNCTION eql_v2.bytea_eq(a bytea, b bytea) RETURNS boolean AS $$
DECLARE
    result boolean;
    differing bytea;
BEGIN

    -- Check if the bytea values are the same length
    IF LENGTH(a) != LENGTH(b) THEN
        RETURN false;
    END IF;

    -- Compare each byte in the bytea values
    result := true;
    FOR i IN 1..LENGTH(a) LOOP
        IF SUBSTRING(a FROM i FOR 1) != SUBSTRING(b FROM i FOR 1) THEN
            result := result AND false;
        END IF;
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Casts a jsonb array of hex-encoded strings to an array of bytea.
CREATE FUNCTION eql_v2.jsonb_array_to_bytea_array(val jsonb)
RETURNS bytea[] AS $$
DECLARE
  terms_arr bytea[];
BEGIN
  IF jsonb_typeof(val) = 'null' THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(decode(value::text, 'hex')::bytea)
    INTO terms_arr
  FROM jsonb_array_elements_text(val) AS value;

  RETURN terms_arr;
END;
$$ LANGUAGE plpgsql;



--
-- Convenience function to log a message
--
CREATE FUNCTION eql_v2.log(s text)
    RETURNS void
AS $$
  BEGIN
    RAISE NOTICE '[LOG] %', s;
END;
$$ LANGUAGE plpgsql;


--
-- Convenience function to describe a test
--
CREATE FUNCTION eql_v2.log(ctx text, s text)
    RETURNS void
AS $$
  BEGIN
    RAISE NOTICE '[LOG] % %', ctx, s;
END;
$$ LANGUAGE plpgsql;

-- Represents a ciphertext encrypted with the CLLW ORE scheme for a fixed output size
-- Each output block is 8-bits
CREATE TYPE eql_v2.ore_cllw_u64_8 AS (
  bytes bytea
);

CREATE EXTENSION IF NOT EXISTS pgcrypto;




CREATE FUNCTION eql_v2.ciphertext(val jsonb)
  RETURNS text
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    IF val ? 'c' THEN
      RETURN val->>'c';
    END IF;
    RAISE 'Expected a ciphertext (c) value in json: %', val;
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.ciphertext(val eql_v2_encrypted)
  RETURNS text
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN eql_v2.ciphertext(val.data);
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2._first_grouped_value(jsonb, jsonb)
RETURNS jsonb AS $$
  SELECT COALESCE($1, $2);
$$ LANGUAGE sql IMMUTABLE;


CREATE AGGREGATE eql_v2.grouped_value(jsonb) (
  SFUNC = eql_v2._first_grouped_value,
  STYPE = jsonb
);


--
-- Adds eql_v2.check_encrypted constraint to the column_name in table_name
--
-- Executes the ALTER TABLE statement
--   `ALTER TABLE {table_name} ADD CONSTRAINT eql_v2_encrypted_check_{column_name} CHECK (eql_v2.check_encrypted({column_name}))`
--
--
CREATE FUNCTION eql_v2.add_encrypted_constraint(table_name TEXT, column_name TEXT)
  RETURNS void
AS $$
	BEGIN
		EXECUTE format('ALTER TABLE %I ADD CONSTRAINT eql_v2_encrypted_check_%I CHECK (eql_v2.check_encrypted(%I))', table_name, column_name, column_name);
	END;
$$ LANGUAGE plpgsql;


--
-- Removes the eql_v2.check_encrypted constraint from the column_name in table_name
--
-- Executes the ALTER TABLE statement
--   `ALTER TABLE {table_name} DROP CONSTRAINT eql_v2_encrypted_check_{column_name}`
--
CREATE FUNCTION eql_v2.remove_encrypted_constraint(table_name TEXT, column_name TEXT)
  RETURNS void
AS $$
	BEGIN
		EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS eql_v2_encrypted_check_%I', table_name, column_name);
	END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.meta_data(val jsonb)
  RETURNS jsonb
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
     RETURN jsonb_build_object(
      'i', val->'i',
      'v', val->'v'
    );
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.meta_data(val eql_v2_encrypted)
  RETURNS jsonb
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
     RETURN eql_v2.meta_data(val.data);
  END;
$$ LANGUAGE plpgsql;


-- Represents a ciphertext encrypted with the CLLW ORE scheme for a variable output size
-- Each output block is 8-bits
CREATE TYPE eql_v2.ore_cllw_var_8 AS (
  bytes bytea
);



-- extracts ste_vec index from a jsonb value

-- extracts ore_cllw_u64_8 index from a jsonb value

CREATE FUNCTION eql_v2.ore_cllw_u64_8(val jsonb)
  RETURNS eql_v2.ore_cllw_u64_8
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    IF val IS NULL THEN
      RETURN NULL;
    END IF;

    IF NOT (eql_v2.has_ore_cllw_u64_8(val)) THEN
        RAISE 'Expected a ore_cllw_u64_8 index (ocf) value in json: %', val;
    END IF;

    RETURN ROW(decode(val->>'ocf', 'hex'));
  END;
$$ LANGUAGE plpgsql;


-- extracts ore_cllw_u64_8 index from an eql_v2_encrypted value

CREATE FUNCTION eql_v2.ore_cllw_u64_8(val eql_v2_encrypted)
  RETURNS eql_v2.ore_cllw_u64_8
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN (SELECT eql_v2.ore_cllw_u64_8(val.data));
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.has_ore_cllw_u64_8(val jsonb)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN val ->> 'ocf' IS NOT NULL;
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.has_ore_cllw_u64_8(val eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN eql_v2.has_ore_cllw_u64_8(val.data);
  END;
$$ LANGUAGE plpgsql;



--
-- Compare ore cllw bytes
-- Used by both fixed and variable ore cllw variants
--

CREATE FUNCTION eql_v2.compare_ore_cllw_term_bytes(a bytea, b bytea)
RETURNS int AS $$
DECLARE
    len_a INT;
    len_b INT;
    x BYTEA;
    y BYTEA;
    i INT;
    differing boolean;
BEGIN

    -- Check if the lengths of the two bytea arguments are the same
    len_a := LENGTH(a);
    len_b := LENGTH(b);

    IF len_a != len_b THEN
      RAISE EXCEPTION 'ore_cllw index terms are not the same length';
    END IF;

    -- Iterate over each byte and compare them
    FOR i IN 1..len_a LOOP
        x := SUBSTRING(a FROM i FOR 1);
        y := SUBSTRING(b FROM i FOR 1);

        -- Check if there's a difference
        IF x != y THEN
            differing := true;
            EXIT;
        END IF;
    END LOOP;

    -- If a difference is found, compare the bytes as in Rust logic
    IF differing THEN
        IF (get_byte(y, 0) + 1) % 256 = get_byte(x, 0) THEN
            RETURN 1;
        ELSE
            RETURN -1;
        END IF;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql;



CREATE DOMAIN eql_v2.blake3 AS text;

-- extracts ste_vec index from a jsonb value

-- extracts blake3 index from a jsonb value


CREATE FUNCTION eql_v2.blake3(val jsonb)
  RETURNS eql_v2.blake3
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    IF val IS NULL THEN
      RETURN NULL;
    END IF;

    IF NOT eql_v2.has_blake3(val) THEN
        RAISE 'Expected a blake3 index (b3) value in json: %', val;
    END IF;

    IF val->>'b3' IS NULL THEN
      RETURN NULL;
    END IF;

    RETURN val->>'b3';
  END;
$$ LANGUAGE plpgsql;


-- extracts blake3 index from an eql_v2_encrypted value

CREATE FUNCTION eql_v2.blake3(val eql_v2_encrypted)
  RETURNS eql_v2.blake3
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN (SELECT eql_v2.blake3(val.data));
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.has_blake3(val jsonb)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN val ->> 'b3' IS NOT NULL;
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.has_blake3(val eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN eql_v2.has_blake3(val.data);
  END;
$$ LANGUAGE plpgsql;


-- extracts hmac_256 index from an encrypted column

CREATE FUNCTION eql_v2.hmac_256(val jsonb)
  RETURNS eql_v2.hmac_256
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    IF val IS NULL THEN
      RETURN NULL;
    END IF;

    IF eql_v2.has_hmac_256(val) THEN
      RETURN val->>'hm';
    END IF;
    RAISE 'Expected a hmac_256 index (hm) value in json: %', val;
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.has_hmac_256(val jsonb)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN val ->> 'hm' IS NOT NULL;
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.has_hmac_256(val eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN eql_v2.has_hmac_256(val.data);
  END;
$$ LANGUAGE plpgsql;



-- extracts hmac_256 index from an encrypted column

CREATE FUNCTION eql_v2.hmac_256(val eql_v2_encrypted)
  RETURNS eql_v2.hmac_256
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN (SELECT eql_v2.hmac_256(val.data));
  END;
$$ LANGUAGE plpgsql;




-- Casts a jsonb array of hex-encoded strings to the `ore_block_u64_8_256` composite type.
-- In other words, this function takes the ORE index format sent through in the
-- EQL payload from Proxy and decodes it as the composite type that we use for
-- ORE operations on the Postgres side.
-- CREATE FUNCTION eql_v2.jsonb_array_to_ore_block_u64_8_256(val jsonb)
-- RETURNS eql_v2.ore_block_u64_8_256 AS $$
-- DECLARE
--   terms_arr eql_v2.ore_block_u64_8_256_term[];
-- BEGIN
--   IF jsonb_typeof(val) = 'null' THEN
--     RETURN NULL;
--   END IF;

--   SELECT array_agg(ROW(decode(value::text, 'hex'))::eql_v2.ore_block_u64_8_256_term)
--     INTO terms_arr
--   FROM jsonb_array_elements_text(val) AS value;

--   PERFORM eql_v2.log('terms', terms_arr::text);

--   RETURN ROW(terms_arr)::eql_v2.ore_block_u64_8_256;
-- END;
-- $$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.jsonb_array_to_ore_block_u64_8_256(val jsonb)
RETURNS eql_v2.ore_block_u64_8_256 AS $$
DECLARE
  terms eql_v2.ore_block_u64_8_256_term[];
BEGIN
  IF jsonb_typeof(val) = 'null' THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(ROW(b)::eql_v2.ore_block_u64_8_256_term)
  INTO terms
  FROM unnest(eql_v2.jsonb_array_to_bytea_array(val)) AS b;

  RETURN ROW(terms)::eql_v2.ore_block_u64_8_256;
END;
$$ LANGUAGE plpgsql;


-- extracts ore index from jsonb
CREATE FUNCTION eql_v2.ore_block_u64_8_256(val jsonb)
  RETURNS eql_v2.ore_block_u64_8_256
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    IF val IS NULL THEN
      RETURN NULL;
    END IF;

    IF eql_v2.has_ore_block_u64_8_256(val) THEN
      RETURN eql_v2.jsonb_array_to_ore_block_u64_8_256(val->'ob');
    END IF;
    RAISE 'Expected an ore index (ob) value in json: %', val;
  END;
$$ LANGUAGE plpgsql;


-- extracts ore index from an encrypted column

CREATE FUNCTION eql_v2.ore_block_u64_8_256(val eql_v2_encrypted)
  RETURNS eql_v2.ore_block_u64_8_256
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN eql_v2.ore_block_u64_8_256(val.data);
  END;
$$ LANGUAGE plpgsql;


--
-- Checks if val contains an ore_block_u64_8_256 search term
--
CREATE FUNCTION eql_v2.has_ore_block_u64_8_256(val jsonb)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN val ->> 'ob' IS NOT NULL;
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.has_ore_block_u64_8_256(val eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN eql_v2.has_ore_block_u64_8_256(val.data);
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.compare_ore_block_u64_8_256_term(a eql_v2.ore_block_u64_8_256_term, b eql_v2.ore_block_u64_8_256_term)
  RETURNS integer
AS $$
  DECLARE
    eq boolean := true;
    unequal_block smallint := 0;
    hash_key bytea;
    data_block bytea;
    encrypt_block bytea;
    target_block bytea;

    left_block_size CONSTANT smallint := 16;
    right_block_size CONSTANT smallint := 32;
    right_offset CONSTANT smallint := 136; -- 8 * 17

    indicator smallint := 0;
  BEGIN
    IF a IS NULL AND b IS NULL THEN
      RETURN 0;
    END IF;

    IF a IS NULL THEN
      RETURN -1;
    END IF;

    IF b IS NULL THEN
      RETURN 1;
    END IF;

    IF bit_length(a.bytes) != bit_length(b.bytes) THEN
      RAISE EXCEPTION 'Ciphertexts are different lengths';
    END IF;

    FOR block IN 0..7 LOOP
      -- Compare each PRP (byte from the first 8 bytes) and PRF block (8 byte
      -- chunks of the rest of the value).
      -- NOTE:
      -- * Substr is ordinally indexed (hence 1 and not 0, and 9 and not 8).
      -- * We are not worrying about timing attacks here; don't fret about
      --   the OR or !=.
      IF
        substr(a.bytes, 1 + block, 1) != substr(b.bytes, 1 + block, 1)
        OR substr(a.bytes, 9 + left_block_size * block, left_block_size) != substr(b.bytes, 9 + left_block_size * BLOCK, left_block_size)
      THEN
        -- set the first unequal block we find
        IF eq THEN
          unequal_block := block;
        END IF;
        eq = false;
      END IF;
    END LOOP;

    IF eq THEN
      RETURN 0::integer;
    END IF;

    -- Hash key is the IV from the right CT of b
    hash_key := substr(b.bytes, right_offset + 1, 16);

    -- first right block is at right offset + nonce_size (ordinally indexed)
    target_block := substr(b.bytes, right_offset + 17 + (unequal_block * right_block_size), right_block_size);

    data_block := substr(a.bytes, 9 + (left_block_size * unequal_block), left_block_size);

    encrypt_block := public.encrypt(data_block::bytea, hash_key::bytea, 'aes-ecb');

    indicator := (
      get_bit(
        encrypt_block,
        0
      ) + get_bit(target_block, get_byte(a.bytes, unequal_block))) % 2;

    IF indicator = 1 THEN
      RETURN 1::integer;
    ELSE
      RETURN -1::integer;
    END IF;
  END;
$$ LANGUAGE plpgsql;


-- Compare the "head" of each array and recurse if necessary
-- This function assumes an empty string is "less than" everything else
-- so if a is empty we return -1, if be is empty and a isn't, we return 1.
-- If both are empty we return 0. This cases probably isn't necessary as equality
-- doesn't always make sense but it's here for completeness.
-- If both are non-empty, we compare the first element. If they are equal
-- we need to consider the next block so we recurse, otherwise we return the comparison result.

CREATE FUNCTION eql_v2.compare_ore_block_u64_8_256_terms(a eql_v2.ore_block_u64_8_256_term[], b eql_v2.ore_block_u64_8_256_term[])
RETURNS integer AS $$
  DECLARE
    cmp_result integer;
  BEGIN

    -- NULLs are NULL
    IF a IS NULL OR b IS NULL THEN
      RETURN NULL;
    END IF;

    -- empty a and b
    IF cardinality(a) = 0 AND cardinality(b) = 0 THEN
      RETURN 0;
    END IF;

    -- empty a and some b
    IF (cardinality(a) = 0) AND cardinality(b) > 0 THEN
      RETURN -1;
    END IF;

    -- some a and empty b
    IF cardinality(a) > 0 AND (cardinality(b) = 0) THEN
      RETURN 1;
    END IF;

    cmp_result := eql_v2.compare_ore_block_u64_8_256_term(a[1], b[1]);

    IF cmp_result = 0 THEN
    -- Removes the first element in the array, and calls this fn again to compare the next element/s in the array.
      RETURN eql_v2.compare_ore_block_u64_8_256_terms(a[2:array_length(a,1)], b[2:array_length(b,1)]);
    END IF;

    RETURN cmp_result;
  END
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.compare_ore_block_u64_8_256_terms(a eql_v2.ore_block_u64_8_256, b eql_v2.ore_block_u64_8_256)
RETURNS integer AS $$
  BEGIN
    RETURN eql_v2.compare_ore_block_u64_8_256_terms(a.terms, b.terms);
  END
$$ LANGUAGE plpgsql;



-- extracts ore_cllw_var_8 index from a jsonb value

CREATE FUNCTION eql_v2.ore_cllw_var_8(val jsonb)
  RETURNS eql_v2.ore_cllw_var_8
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN

    IF val IS NULL THEN
      RETURN NULL;
    END IF;

    IF NOT (eql_v2.has_ore_cllw_var_8(val)) THEN
        RAISE 'Expected a ore_cllw_var_8 index (ocv) value in json: %', val;
    END IF;

    RETURN ROW(decode(val->>'ocv', 'hex'));
  END;
$$ LANGUAGE plpgsql;


-- extracts ore_cllw_var_8 index from an eql_v2_encrypted value

CREATE FUNCTION eql_v2.ore_cllw_var_8(val eql_v2_encrypted)
  RETURNS eql_v2.ore_cllw_var_8
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN (SELECT eql_v2.ore_cllw_var_8(val.data));
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.has_ore_cllw_var_8(val jsonb)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN val ->> 'ocv' IS NOT NULL;
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.has_ore_cllw_var_8(val eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN eql_v2.has_ore_cllw_var_8(val.data);
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.compare_ore_cllw_var_8_term(a eql_v2.ore_cllw_var_8, b eql_v2.ore_cllw_var_8)
RETURNS int AS $$
DECLARE
    len_a INT;
    len_b INT;
    -- length of the common part of the two bytea values
    common_len INT;
    cmp_result INT;
BEGIN
    IF a IS NULL OR b IS NULL THEN
      RETURN NULL;
    END IF;

    -- Get the lengths of both bytea inputs
    len_a := LENGTH(a.bytes);
    len_b := LENGTH(b.bytes);

    -- Handle empty cases
    IF len_a = 0 AND len_b = 0 THEN
        RETURN 0;
    ELSIF len_a = 0 THEN
        RETURN -1;
    ELSIF len_b = 0 THEN
        RETURN 1;
    END IF;

    -- Find the length of the shorter bytea
    IF len_a < len_b THEN
        common_len := len_a;
    ELSE
        common_len := len_b;
    END IF;

    -- Use the compare_ore_cllw_term function to compare byte by byte
    cmp_result := eql_v2.compare_ore_cllw_term_bytes(
      SUBSTRING(a.bytes FROM 1 FOR common_len),
      SUBSTRING(b.bytes FROM 1 FOR common_len)
    );

    -- If the comparison returns 'less' or 'greater', return that result
    IF cmp_result = -1 THEN
        RETURN -1;
    ELSIF cmp_result = 1 THEN
        RETURN 1;
    END IF;

    -- If the bytea comparison is 'equal', compare lengths
    IF len_a < len_b THEN
        RETURN -1;
    ELSIF len_a > len_b THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql;







--
-- Compare two eql_v2_encrypted values
--
-- Function is used to implement all operators required for btree indexing"
--      - `<`
--      - `<=`
--      - `=`
--      - `>=`
--      - `>`
--
--
-- Index terms are checked in the following order:
--    - `ore_block_u64_8_256`
--    - `ore_cllw_u64_8`
--    - `ore_cllw_var_8`
--    - `hmac_256`
--    - `blake3`
--
-- The first index term present for both values is used for comparsion.
--
-- If no index terms are found, the encrypted data is compared as a jsonb literal.
-- Btree index must have a consistent ordering for a given state, without this text fallback, database errors with "lock BufferContent is not held"
--
CREATE FUNCTION eql_v2.compare(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS integer
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN

    IF a IS NULL AND b IS NULL THEN
      RETURN 0;
    END IF;

    IF a IS NULL THEN
      RETURN -1;
    END IF;

    IF b IS NULL THEN
      RETURN 1;
    END IF;

    a := eql_v2.to_ste_vec_value(a);
    b := eql_v2.to_ste_vec_value(b);

    IF eql_v2.has_ore_block_u64_8_256(a) AND eql_v2.has_ore_block_u64_8_256(b) THEN
      RETURN eql_v2.compare_ore_block_u64_8_256(a, b);
    END IF;

    IF eql_v2.has_ore_cllw_u64_8(a) AND eql_v2.has_ore_cllw_u64_8(b) THEN
      RETURN eql_v2.compare_ore_cllw_u64_8(a, b);
    END IF;

    IF eql_v2.has_ore_cllw_var_8(a) AND eql_v2.has_ore_cllw_var_8(b) THEN
      RETURN eql_v2.compare_ore_cllw_var_8(a, b);
    END IF;

    IF eql_v2.has_hmac_256(a) AND eql_v2.has_hmac_256(b) THEN
      RETURN eql_v2.compare_hmac_256(a, b);
    END IF;

    IF eql_v2.has_blake3(a) AND eql_v2.has_blake3(b) THEN
      RETURN eql_v2.compare_blake3(a, b);
    END IF;

    -- Fallback to literal comparison of the encrypted data
    -- Compare must have consistent ordering for a given state
    -- Without this text fallback, database errors with "lock BufferContent is not held"
    RETURN eql_v2.compare_literal(a, b);

  END;
$$ LANGUAGE plpgsql;



--
-- Convert jsonb to eql_v2.encrypted
--

CREATE FUNCTION eql_v2.to_encrypted(data jsonb)
    RETURNS public.eql_v2_encrypted
    IMMUTABLE STRICT PARALLEL SAFE
AS $$
BEGIN
    IF data IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN ROW(data)::public.eql_v2_encrypted;
END;
$$ LANGUAGE plpgsql;


--
-- Cast jsonb to eql_v2.encrypted
--

CREATE CAST (jsonb AS public.eql_v2_encrypted)
	WITH FUNCTION eql_v2.to_encrypted(jsonb) AS ASSIGNMENT;


--
-- Convert text to eql_v2.encrypted
--

CREATE FUNCTION eql_v2.to_encrypted(data text)
    RETURNS public.eql_v2_encrypted
    IMMUTABLE STRICT PARALLEL SAFE
AS $$
BEGIN
    IF data IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN eql_v2.to_encrypted(data::jsonb);
END;
$$ LANGUAGE plpgsql;


--
-- Cast text to eql_v2.encrypted
--

CREATE CAST (text AS public.eql_v2_encrypted)
	WITH FUNCTION eql_v2.to_encrypted(text) AS ASSIGNMENT;



--
-- Convert eql_v2.encrypted to jsonb
--

CREATE FUNCTION eql_v2.to_jsonb(e public.eql_v2_encrypted)
    RETURNS jsonb
    IMMUTABLE STRICT PARALLEL SAFE
AS $$
BEGIN
    IF e IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN e.data;
END;
$$ LANGUAGE plpgsql;

--
-- Cast eql_v2.encrypted to jsonb
--

CREATE CAST (public.eql_v2_encrypted AS jsonb)
	WITH FUNCTION eql_v2.to_jsonb(public.eql_v2_encrypted) AS ASSIGNMENT;



--
-- cs_configuration_data_v2 is a jsonb column that stores the actual configuration
--
-- For some reason CREATE DOMAIN and CREATE TYPE do not support IF NOT EXISTS
-- Types cannot be dropped if used by a table, and we never drop the configuration table
-- DOMAIN constraints are added separately and not tied to DOMAIN creation
--
-- DO $$
--   BEGIN
--     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'configuration_data') THEN
--       CREATE DOMAIN eql_v2.configuration_data AS JSONB;
--     END IF;
--   END
-- $$;

--
-- cs_configuration_state_v2 is an ENUM that defines the valid configuration states
-- --
DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eql_v2_configuration_state') THEN
      CREATE TYPE public.eql_v2_configuration_state AS ENUM ('active', 'inactive', 'encrypting', 'pending');
    END IF;
  END
$$;



-- extracts match index from an emcrypted column

CREATE FUNCTION eql_v2.bloom_filter(val jsonb)
  RETURNS eql_v2.bloom_filter
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    IF val IS NULL THEN
      RETURN NULL;
    END IF;

    IF eql_v2.has_bloom_filter(val) THEN
      RETURN ARRAY(SELECT jsonb_array_elements(val->'bf'))::eql_v2.bloom_filter;
    END IF;

    RAISE 'Expected a match index (bf) value in json: %', val;
  END;
$$ LANGUAGE plpgsql;


-- extracts unique index from an encrypted column

CREATE FUNCTION eql_v2.bloom_filter(val eql_v2_encrypted)
  RETURNS eql_v2.bloom_filter
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN (SELECT eql_v2.bloom_filter(val.data));
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.has_bloom_filter(val jsonb)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN val ->> 'bf' IS NOT NULL;
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.has_bloom_filter(val eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN eql_v2.has_bloom_filter(val.data);
  END;
$$ LANGUAGE plpgsql;

--
-- Compare two eql_v2_encrypted values as literal jsonb values
-- Used as a fallback when no suitable search term is available
--
CREATE FUNCTION eql_v2.compare_literal(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS integer
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    a_data jsonb;
    b_data jsonb;
  BEGIN

    IF a IS NULL AND b IS NULL THEN
      RETURN 0;
    END IF;

    IF a IS NULL THEN
      RETURN -1;
    END IF;

    IF b IS NULL THEN
      RETURN 1;
    END IF;

    a_data := a.data;
    b_data := b.data;

    IF a_data < b_data THEN
      RETURN -1;
    END IF;

    IF a_data > b_data THEN
      RETURN 1;
    END IF;

    RETURN 0;
  END;
$$ LANGUAGE plpgsql;


-- Operators for < less than comparisons of eql_v2_encrypted types
--
-- Uses `eql_v2.compare` for the actual comparison logic.
--
--
CREATE FUNCTION eql_v2.lt(a eql_v2_encrypted, b eql_v2_encrypted)
RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.compare(a, b) = -1;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2."<"(a eql_v2_encrypted, b eql_v2_encrypted)
RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.lt(a, b);
  END;
$$ LANGUAGE plpgsql;

CREATE OPERATOR <(
  FUNCTION=eql_v2."<",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=eql_v2_encrypted,
  COMMUTATOR = >,
  NEGATOR = >=,
  RESTRICT = scalarltsel,
  JOIN = scalarltjoinsel
);



CREATE FUNCTION eql_v2."<"(a eql_v2_encrypted, b jsonb)
RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.lt(a, b::eql_v2_encrypted);
  END;
$$ LANGUAGE plpgsql;

CREATE OPERATOR <(
  FUNCTION=eql_v2."<",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=jsonb,
  COMMUTATOR = >,
  NEGATOR = >=,
  RESTRICT = scalarltsel,
  JOIN = scalarltjoinsel
);



CREATE FUNCTION eql_v2."<"(a jsonb, b eql_v2_encrypted)
RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.lt(a::eql_v2_encrypted, b);
  END;
$$ LANGUAGE plpgsql;


CREATE OPERATOR <(
  FUNCTION=eql_v2."<",
  LEFTARG=jsonb,
  RIGHTARG=eql_v2_encrypted,
  COMMUTATOR = >,
  NEGATOR = >=,
  RESTRICT = scalarltsel,
  JOIN = scalarltjoinsel
);




-- Operators for <= less than or equal to comparisons of eql_v2_encrypted types
--
-- Uses `eql_v2.compare` for the actual comparison logic.
--
--
CREATE FUNCTION eql_v2.lte(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.compare(a, b) <= 0;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2."<="(a eql_v2_encrypted, b eql_v2_encrypted)
RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.lte(a, b);
  END;
$$ LANGUAGE plpgsql;

CREATE OPERATOR <=(
  FUNCTION = eql_v2."<=",
  LEFTARG = eql_v2_encrypted,
  RIGHTARG = eql_v2_encrypted,
  COMMUTATOR = >=,
  NEGATOR = >,
  RESTRICT = scalarltsel,
  JOIN = scalarltjoinsel
);



CREATE FUNCTION eql_v2."<="(a eql_v2_encrypted, b jsonb)
RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.lte(a, b::eql_v2_encrypted);
  END;
$$ LANGUAGE plpgsql;

CREATE OPERATOR <=(
  FUNCTION = eql_v2."<=",
  LEFTARG = eql_v2_encrypted,
  RIGHTARG = jsonb,
  COMMUTATOR = >=,
  NEGATOR = >,
  RESTRICT = scalarltsel,
  JOIN = scalarltjoinsel
);



CREATE FUNCTION eql_v2."<="(a jsonb, b eql_v2_encrypted)
RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.lte(a::eql_v2_encrypted, b);
  END;
$$ LANGUAGE plpgsql;


CREATE OPERATOR <=(
  FUNCTION = eql_v2."<=",
  LEFTARG = jsonb,
  RIGHTARG = eql_v2_encrypted,
  COMMUTATOR = >=,
  NEGATOR = >,
  RESTRICT = scalarltsel,
  JOIN = scalarltjoinsel
);




-- Operators for = equality comparisons of eql_v2_encrypted types
--
-- Uses `eql_v2.compare` for the actual comparison logic.
--
--
CREATE FUNCTION eql_v2.eq(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN eql_v2.compare(a, b) = 0;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2."="(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN eql_v2.eq(a, b);
  END;
$$ LANGUAGE plpgsql;

CREATE OPERATOR = (
  FUNCTION=eql_v2."=",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=eql_v2_encrypted,
  NEGATOR = <>,
  RESTRICT = eqsel,
  JOIN = eqjoinsel,
  HASHES,
  MERGES
);


CREATE FUNCTION eql_v2."="(a eql_v2_encrypted, b jsonb)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN eql_v2.eq(a, b::eql_v2_encrypted);
  END;
$$ LANGUAGE plpgsql;

CREATE OPERATOR = (
  FUNCTION=eql_v2."=",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=jsonb,
  NEGATOR = <>,
  RESTRICT = eqsel,
  JOIN = eqjoinsel,
  HASHES,
  MERGES
);


CREATE FUNCTION eql_v2."="(a jsonb, b eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN eql_v2.eq(a::eql_v2_encrypted, b);
  END;
$$ LANGUAGE plpgsql;

CREATE OPERATOR = (
  FUNCTION=eql_v2."=",
  LEFTARG=jsonb,
  RIGHTARG=eql_v2_encrypted,
  NEGATOR = <>,
  RESTRICT = eqsel,
  JOIN = eqjoinsel,
  HASHES,
  MERGES
);



-- Operators for >= greater than or equal to comparisons of eql_v2_encrypted types
--
-- Uses `eql_v2.compare` for the actual comparison logic.
--
--
CREATE FUNCTION eql_v2.gte(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.compare(a, b) >= 0;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.">="(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.gte(a, b);
  END;
$$ LANGUAGE plpgsql;


CREATE OPERATOR >=(
  FUNCTION = eql_v2.">=",
  LEFTARG = eql_v2_encrypted,
  RIGHTARG = eql_v2_encrypted,
  COMMUTATOR = <=,
  NEGATOR = <,
  RESTRICT = scalarltsel,
  JOIN = scalarltjoinsel
);



CREATE FUNCTION eql_v2.">="(a eql_v2_encrypted, b jsonb)
RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.gte(a, b::eql_v2_encrypted);
  END;
$$ LANGUAGE plpgsql;

CREATE OPERATOR >=(
  FUNCTION = eql_v2.">=",
  LEFTARG = eql_v2_encrypted,
  RIGHTARG=jsonb,
  COMMUTATOR = <=,
  NEGATOR = <,
  RESTRICT = scalarltsel,
  JOIN = scalarltjoinsel
);



CREATE FUNCTION eql_v2.">="(a jsonb, b eql_v2_encrypted)
RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.gte(a::eql_v2_encrypted, b);
  END;
$$ LANGUAGE plpgsql;


CREATE OPERATOR >=(
  FUNCTION = eql_v2.">=",
  LEFTARG = jsonb,
  RIGHTARG =eql_v2_encrypted,
  COMMUTATOR = <=,
  NEGATOR = <,
  RESTRICT = scalarltsel,
  JOIN = scalarltjoinsel
);




-- Operators for > greater than comparisons of eql_v2_encrypted types
--
-- Uses `eql_v2.compare` for the actual comparison logic.
--
--
CREATE FUNCTION eql_v2.gt(a eql_v2_encrypted, b eql_v2_encrypted)
RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.compare(a, b) = 1;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.">"(a eql_v2_encrypted, b eql_v2_encrypted)
RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.gt(a, b);
  END;
$$ LANGUAGE plpgsql;

CREATE OPERATOR >(
  FUNCTION=eql_v2.">",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=eql_v2_encrypted,
  COMMUTATOR = <,
  NEGATOR = <=,
  RESTRICT = scalarltsel,
  JOIN = scalarltjoinsel
);



CREATE FUNCTION eql_v2.">"(a eql_v2_encrypted, b jsonb)
RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.gt(a, b::eql_v2_encrypted);
  END;
$$ LANGUAGE plpgsql;

CREATE OPERATOR >(
  FUNCTION = eql_v2.">",
  LEFTARG = eql_v2_encrypted,
  RIGHTARG = jsonb,
  COMMUTATOR = <,
  NEGATOR = <=,
  RESTRICT = scalarltsel,
  JOIN = scalarltjoinsel
);



CREATE FUNCTION eql_v2.">"(a jsonb, b eql_v2_encrypted)
RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.gt(a::eql_v2_encrypted, b);
  END;
$$ LANGUAGE plpgsql;


CREATE OPERATOR >(
  FUNCTION = eql_v2.">",
  LEFTARG = jsonb,
  RIGHTARG = eql_v2_encrypted,
  COMMUTATOR = <,
  NEGATOR = <=,
  RESTRICT = scalarltsel,
  JOIN = scalarltjoinsel
);




--
CREATE FUNCTION eql_v2.ste_vec(val jsonb)
  RETURNS eql_v2_encrypted[]
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    sv jsonb;
    ary eql_v2_encrypted[];
	BEGIN

    IF val ? 'sv' THEN
      sv := val->'sv';
    ELSE
      sv := jsonb_build_array(val);
    END IF;

    SELECT array_agg(eql_v2.to_encrypted(elem))
      INTO ary
      FROM jsonb_array_elements(sv) AS elem;

    RETURN ary;
  END;
$$ LANGUAGE plpgsql;


-- extracts ste_vec index from an eql_v2_encrypted value

CREATE FUNCTION eql_v2.ste_vec(val eql_v2_encrypted)
  RETURNS eql_v2_encrypted[]
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN (SELECT eql_v2.ste_vec(val.data));
  END;
$$ LANGUAGE plpgsql;

--
-- Returns true if val is an SteVec with a single array item.
-- SteVec value items can be treated as regular eql_encrypted
--
CREATE FUNCTION eql_v2.is_ste_vec_value(val jsonb)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    IF val ? 'sv' THEN
      RETURN jsonb_array_length(val->'sv') = 1;
    END IF;

    RETURN false;
  END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION eql_v2.is_ste_vec_value(val eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN eql_v2.is_ste_vec_value(val.data);
  END;
$$ LANGUAGE plpgsql;

--
-- Returns an SteVec with a single array item as an eql_encrypted
--
CREATE FUNCTION eql_v2.to_ste_vec_value(val jsonb)
  RETURNS eql_v2_encrypted
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    meta jsonb;
    sv jsonb;
	BEGIN

    IF val IS NULL THEN
      RETURN NULL;
    END IF;

    IF eql_v2.is_ste_vec_value(val) THEN
      meta := eql_v2.meta_data(val);
      sv := val->'sv';
      sv := sv[0];

      RETURN eql_v2.to_encrypted(meta || sv);
    END IF;

    RETURN eql_v2.to_encrypted(val);
  END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION eql_v2.to_ste_vec_value(val eql_v2_encrypted)
  RETURNS eql_v2_encrypted
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN eql_v2.to_ste_vec_value(val.data);
  END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION eql_v2.selector(val jsonb)
  RETURNS text
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    IF val IS NULL THEN
      RETURN NULL;
    END IF;

    IF val ? 's' THEN
      RETURN val->>'s';
    END IF;
    RAISE 'Expected a selector index (s) value in json: %', val;
  END;
$$ LANGUAGE plpgsql;


-- extracts ste_vec index from an eql_v2_encrypted value

CREATE FUNCTION eql_v2.selector(val eql_v2_encrypted)
  RETURNS text
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN (SELECT eql_v2.selector(val.data));
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.is_ste_vec_array(val jsonb)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    IF val ? 'a' THEN
      RETURN (val->>'a')::boolean;
    END IF;

    RETURN false;
  END;
$$ LANGUAGE plpgsql;


-- extracts ste_vec index from an eql_v2_encrypted value

CREATE FUNCTION eql_v2.is_ste_vec_array(val eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN (SELECT eql_v2.is_ste_vec_array(val.data));
  END;
$$ LANGUAGE plpgsql;



-- Returns true if b is contained in any element of a
CREATE FUNCTION eql_v2.ste_vec_contains(a eql_v2_encrypted[], b eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    result boolean;
    _a eql_v2_encrypted;
  BEGIN

    result := false;

    FOR idx IN 1..array_length(a, 1) LOOP
      _a := a[idx];
      result := result OR (eql_v2.selector(_a) = eql_v2.selector(b) AND _a = b);
    END LOOP;

    RETURN result;
  END;
$$ LANGUAGE plpgsql;


-- Returns true if a contains b
-- All values of b must be in a
CREATE FUNCTION eql_v2.ste_vec_contains(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    result boolean;
    sv_a eql_v2_encrypted[];
    sv_b eql_v2_encrypted[];
    _b eql_v2_encrypted;
  BEGIN

    -- jsonb arrays of ste_vec encrypted values
    sv_a := eql_v2.ste_vec(a);
    sv_b := eql_v2.ste_vec(b);

    -- an empty b is always contained in a
    IF array_length(sv_b, 1) IS NULL THEN
      RETURN true;
    END IF;

    IF array_length(sv_a, 1) IS NULL THEN
      RETURN false;
    END IF;

    result := true;

    -- for each element of b check if it is in a
    FOR idx IN 1..array_length(sv_b, 1) LOOP
      _b := sv_b[idx];
      result := result AND eql_v2.ste_vec_contains(sv_a, _b);
    END LOOP;

    RETURN result;
  END;
$$ LANGUAGE plpgsql;

--
--
-- CREATE the eql_v2_configuration TABLE
--
CREATE TABLE IF NOT EXISTS public.eql_v2_configuration
(
    id bigint GENERATED ALWAYS AS IDENTITY,
    state eql_v2_configuration_state NOT NULL DEFAULT 'pending',
    data jsonb,
    created_at timestamptz not null default current_timestamp,
    PRIMARY KEY(id)
);

--
-- Private configuration functions
-- Internal implemention details that customers should not need to worry about.
--
--

CREATE FUNCTION eql_v2.config_default(config jsonb)
  RETURNS jsonb
  IMMUTABLE PARALLEL SAFE
AS $$
  BEGIN
    IF config IS NULL THEN
      SELECT jsonb_build_object('v', 1, 'tables', jsonb_build_object()) INTO config;
    END IF;
    RETURN config;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.config_add_table(table_name text, config jsonb)
  RETURNS jsonb
  IMMUTABLE PARALLEL SAFE
AS $$
  DECLARE
    tbl jsonb;
  BEGIN
    IF NOT config #> array['tables'] ? table_name THEN
      SELECT jsonb_insert(config, array['tables', table_name], jsonb_build_object()) INTO config;
    END IF;
    RETURN config;
  END;
$$ LANGUAGE plpgsql;


-- Add the column if it doesn't exist

CREATE FUNCTION eql_v2.config_add_column(table_name text, column_name text, config jsonb)
  RETURNS jsonb
  IMMUTABLE PARALLEL SAFE
AS $$
  DECLARE
    col jsonb;
  BEGIN
    IF NOT config #> array['tables', table_name] ? column_name THEN
      SELECT jsonb_build_object('indexes', jsonb_build_object()) into col;
      SELECT jsonb_set(config, array['tables', table_name, column_name], col) INTO config;
    END IF;
    RETURN config;
  END;
$$ LANGUAGE plpgsql;


-- Set the cast

CREATE FUNCTION eql_v2.config_add_cast(table_name text, column_name text, cast_as text, config jsonb)
  RETURNS jsonb
  IMMUTABLE PARALLEL SAFE
AS $$
  BEGIN
    SELECT jsonb_set(config, array['tables', table_name, column_name, 'cast_as'], to_jsonb(cast_as)) INTO config;
    RETURN config;
  END;
$$ LANGUAGE plpgsql;


-- Add the column if it doesn't exist

CREATE FUNCTION eql_v2.config_add_index(table_name text, column_name text, index_name text, opts jsonb, config jsonb)
  RETURNS jsonb
  IMMUTABLE PARALLEL SAFE
AS $$
  BEGIN
    SELECT jsonb_insert(config, array['tables', table_name, column_name, 'indexes', index_name], opts) INTO config;
    RETURN config;
  END;
$$ LANGUAGE plpgsql;


--
-- Default options for match index
--

CREATE FUNCTION eql_v2.config_match_default()
  RETURNS jsonb
LANGUAGE sql STRICT PARALLEL SAFE
BEGIN ATOMIC
  SELECT jsonb_build_object(
            'k', 6,
            'bf', 2048,
            'include_original', true,
            'tokenizer', json_build_object('kind', 'ngram', 'token_length', 3),
            'token_filters', json_build_array(json_build_object('kind', 'downcase')));
END;
-- AUTOMATICALLY GENERATED FILE
-- Source is version-template.sql

DROP FUNCTION IF EXISTS eql_v2.version();

CREATE FUNCTION eql_v2.version()
  RETURNS text
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT 'eql-2.1.8';
$$ LANGUAGE SQL;



CREATE FUNCTION eql_v2.compare_ore_cllw_var_8(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS integer
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    a_term eql_v2.ore_cllw_var_8;
    b_term eql_v2.ore_cllw_var_8;
  BEGIN

    -- PERFORM eql_v2.log('eql_v2.compare_ore_cllw_var_8');
    -- PERFORM eql_v2.log('a', a::text);
    -- PERFORM eql_v2.log('b', b::text);

    IF a IS NULL AND b IS NULL THEN
      RETURN 0;
    END IF;

    IF a IS NULL THEN
      RETURN -1;
    END IF;

    IF b IS NULL THEN
      RETURN 1;
    END IF;

    IF eql_v2.has_ore_cllw_var_8(a) THEN
      a_term := eql_v2.ore_cllw_var_8(a);
    END IF;

    IF eql_v2.has_ore_cllw_var_8(a) THEN
      b_term := eql_v2.ore_cllw_var_8(b);
    END IF;

    IF a_term IS NULL AND b_term IS NULL THEN
      RETURN 0;
    END IF;

    IF a_term IS NULL THEN
      RETURN -1;
    END IF;

    IF b_term IS NULL THEN
      RETURN 1;
    END IF;

    RETURN eql_v2.compare_ore_cllw_var_8_term(a_term, b_term);
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.compare_ore_cllw_u64_8(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS integer
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    a_term eql_v2.ore_cllw_u64_8;
    b_term eql_v2.ore_cllw_u64_8;
  BEGIN

    -- PERFORM eql_v2.log('eql_v2.compare_ore_cllw_u64_8');
    -- PERFORM eql_v2.log('a', a::text);
    -- PERFORM eql_v2.log('b', b::text);

    IF a IS NULL AND b IS NULL THEN
      RETURN 0;
    END IF;

    IF a IS NULL THEN
      RETURN -1;
    END IF;

    IF b IS NULL THEN
      RETURN 1;
    END IF;

    IF eql_v2.has_ore_cllw_u64_8(a) THEN
      a_term := eql_v2.ore_cllw_u64_8(a);
    END IF;

    IF eql_v2.has_ore_cllw_u64_8(a) THEN
      b_term := eql_v2.ore_cllw_u64_8(b);
    END IF;

    IF a_term IS NULL AND b_term IS NULL THEN
      RETURN 0;
    END IF;

    IF a_term IS NULL THEN
      RETURN -1;
    END IF;

    IF b_term IS NULL THEN
      RETURN 1;
    END IF;

    RETURN eql_v2.compare_ore_cllw_term_bytes(a_term.bytes, b_term.bytes);
  END;
$$ LANGUAGE plpgsql;

-- NOTE FILE IS DISABLED


CREATE FUNCTION eql_v2.ore_block_u64_8_256_eq(a eql_v2.ore_block_u64_8_256, b eql_v2.ore_block_u64_8_256)
RETURNS boolean AS $$
  SELECT eql_v2.compare_ore_block_u64_8_256_terms(a, b) = 0
$$ LANGUAGE SQL;



CREATE FUNCTION eql_v2.ore_block_u64_8_256_neq(a eql_v2.ore_block_u64_8_256, b eql_v2.ore_block_u64_8_256)
RETURNS boolean AS $$
  SELECT eql_v2.compare_ore_block_u64_8_256_terms(a, b) <> 0
$$ LANGUAGE SQL;



CREATE FUNCTION eql_v2.ore_block_u64_8_256_lt(a eql_v2.ore_block_u64_8_256, b eql_v2.ore_block_u64_8_256)
RETURNS boolean AS $$
  SELECT eql_v2.compare_ore_block_u64_8_256_terms(a, b) = -1
$$ LANGUAGE SQL;



CREATE FUNCTION eql_v2.ore_block_u64_8_256_lte(a eql_v2.ore_block_u64_8_256, b eql_v2.ore_block_u64_8_256)
RETURNS boolean AS $$
  SELECT eql_v2.compare_ore_block_u64_8_256_terms(a, b) != 1
$$ LANGUAGE SQL;



CREATE FUNCTION eql_v2.ore_block_u64_8_256_gt(a eql_v2.ore_block_u64_8_256, b eql_v2.ore_block_u64_8_256)
RETURNS boolean AS $$
  SELECT eql_v2.compare_ore_block_u64_8_256_terms(a, b) = 1
$$ LANGUAGE SQL;



CREATE FUNCTION eql_v2.ore_block_u64_8_256_gte(a eql_v2.ore_block_u64_8_256, b eql_v2.ore_block_u64_8_256)
RETURNS boolean AS $$
  SELECT eql_v2.compare_ore_block_u64_8_256_terms(a, b) != -1
$$ LANGUAGE SQL;



CREATE OPERATOR = (
  FUNCTION=eql_v2.ore_block_u64_8_256_eq,
  LEFTARG=eql_v2.ore_block_u64_8_256,
  RIGHTARG=eql_v2.ore_block_u64_8_256,
  NEGATOR = <>,
  RESTRICT = eqsel,
  JOIN = eqjoinsel,
  HASHES,
  MERGES
);



CREATE OPERATOR <> (
  FUNCTION=eql_v2.ore_block_u64_8_256_neq,
  LEFTARG=eql_v2.ore_block_u64_8_256,
  RIGHTARG=eql_v2.ore_block_u64_8_256,
  NEGATOR = =,
  RESTRICT = eqsel,
  JOIN = eqjoinsel,
  HASHES,
  MERGES
);


CREATE OPERATOR > (
  FUNCTION=eql_v2.ore_block_u64_8_256_gt,
  LEFTARG=eql_v2.ore_block_u64_8_256,
  RIGHTARG=eql_v2.ore_block_u64_8_256,
  COMMUTATOR = <,
  NEGATOR = <=,
  RESTRICT = scalargtsel,
  JOIN = scalargtjoinsel
);



CREATE OPERATOR < (
  FUNCTION=eql_v2.ore_block_u64_8_256_lt,
  LEFTARG=eql_v2.ore_block_u64_8_256,
  RIGHTARG=eql_v2.ore_block_u64_8_256,
  COMMUTATOR = >,
  NEGATOR = >=,
  RESTRICT = scalarltsel,
  JOIN = scalarltjoinsel
);



CREATE OPERATOR <= (
  FUNCTION=eql_v2.ore_block_u64_8_256_lte,
  LEFTARG=eql_v2.ore_block_u64_8_256,
  RIGHTARG=eql_v2.ore_block_u64_8_256,
  COMMUTATOR = >=,
  NEGATOR = >,
  RESTRICT = scalarlesel,
  JOIN = scalarlejoinsel
);



CREATE OPERATOR >= (
  FUNCTION=eql_v2.ore_block_u64_8_256_gte,
  LEFTARG=eql_v2.ore_block_u64_8_256,
  RIGHTARG=eql_v2.ore_block_u64_8_256,
  COMMUTATOR = <=,
  NEGATOR = <,
  RESTRICT = scalarlesel,
  JOIN = scalarlejoinsel
);
-- NOTE FILE IS DISABLED



CREATE OPERATOR FAMILY eql_v2.ore_block_u64_8_256_operator_family USING btree;

CREATE OPERATOR CLASS eql_v2.ore_block_u64_8_256_operator_class DEFAULT FOR TYPE eql_v2.ore_block_u64_8_256 USING btree FAMILY eql_v2.ore_block_u64_8_256_operator_family  AS
        OPERATOR 1 <,
        OPERATOR 2 <=,
        OPERATOR 3 =,
        OPERATOR 4 >=,
        OPERATOR 5 >,
        FUNCTION 1 eql_v2.compare_ore_block_u64_8_256_terms(a eql_v2.ore_block_u64_8_256, b eql_v2.ore_block_u64_8_256);


CREATE FUNCTION eql_v2.compare_ore_block_u64_8_256(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS integer
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    a_term eql_v2.ore_block_u64_8_256;
    b_term eql_v2.ore_block_u64_8_256;
  BEGIN

    IF a IS NULL AND b IS NULL THEN
      RETURN 0;
    END IF;

    IF a IS NULL THEN
      RETURN -1;
    END IF;

    IF b IS NULL THEN
      RETURN 1;
    END IF;

    IF eql_v2.has_ore_block_u64_8_256(a) THEN
      a_term := eql_v2.ore_block_u64_8_256(a);
    END IF;

    IF eql_v2.has_ore_block_u64_8_256(a) THEN
      b_term := eql_v2.ore_block_u64_8_256(b);
    END IF;

    IF a_term IS NULL AND b_term IS NULL THEN
      RETURN 0;
    END IF;

    IF a_term IS NULL THEN
      RETURN -1;
    END IF;

    IF b_term IS NULL THEN
      RETURN 1;
    END IF;

    RETURN eql_v2.compare_ore_block_u64_8_256_terms(a_term.terms, b_term.terms);
  END;
$$ LANGUAGE plpgsql;


-- casts text to ore_block_u64_8_256_term (bytea)

CREATE FUNCTION eql_v2.text_to_ore_block_u64_8_256_term(t text)
  RETURNS eql_v2.ore_block_u64_8_256_term
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
BEGIN ATOMIC
	RETURN t::bytea;
END;

-- cast to cleanup ore_block_u64_8_256 extraction

CREATE CAST (text AS eql_v2.ore_block_u64_8_256_term)
	WITH FUNCTION eql_v2.text_to_ore_block_u64_8_256_term(text) AS IMPLICIT;

-- Operators for match comparisons of eql_v2_encrypted types
--
-- Support for the following comparisons:
--
--      eql_v2_encrypted ~~ eql_v2_encrypted
--      eql_v2_encrypted ~~ jsonb
--      eql_v2_encrypted ~~ eql_v2.bloom_filter
--



CREATE FUNCTION eql_v2.like(a eql_v2_encrypted, b eql_v2_encrypted)
RETURNS boolean AS $$
  SELECT eql_v2.bloom_filter(a) @> eql_v2.bloom_filter(b);
$$ LANGUAGE SQL;


--
-- Case sensitivity depends on the index term configuration
-- Function preserves the SQL semantics
--
CREATE FUNCTION eql_v2.ilike(a eql_v2_encrypted, b eql_v2_encrypted)
RETURNS boolean AS $$
  SELECT eql_v2.bloom_filter(a) @> eql_v2.bloom_filter(b);
$$ LANGUAGE SQL;





CREATE FUNCTION eql_v2."~~"(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.like(a, b);
  END;
$$ LANGUAGE plpgsql;

CREATE OPERATOR ~~(
  FUNCTION=eql_v2."~~",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=eql_v2_encrypted,
  RESTRICT = eqsel,
  JOIN = eqjoinsel,
  HASHES,
  MERGES
);


CREATE OPERATOR ~~*(
  FUNCTION=eql_v2."~~",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=eql_v2_encrypted,
  RESTRICT = eqsel,
  JOIN = eqjoinsel,
  HASHES,
  MERGES
);



CREATE FUNCTION eql_v2."~~"(a eql_v2_encrypted, b jsonb)
  RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.like(a, b::eql_v2_encrypted);
  END;
$$ LANGUAGE plpgsql;


CREATE OPERATOR ~~(
  FUNCTION=eql_v2."~~",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=jsonb,
  RESTRICT = eqsel,
  JOIN = eqjoinsel,
  HASHES,
  MERGES
);

CREATE OPERATOR ~~*(
  FUNCTION=eql_v2."~~",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=jsonb,
  RESTRICT = eqsel,
  JOIN = eqjoinsel,
  HASHES,
  MERGES
);




CREATE FUNCTION eql_v2."~~"(a jsonb, b eql_v2_encrypted)
  RETURNS boolean
AS $$
  BEGIN
    RETURN eql_v2.like(a::eql_v2_encrypted, b);
  END;
$$ LANGUAGE plpgsql;


CREATE OPERATOR ~~(
  FUNCTION=eql_v2."~~",
  LEFTARG=jsonb,
  RIGHTARG=eql_v2_encrypted,
  RESTRICT = eqsel,
  JOIN = eqjoinsel,
  HASHES,
  MERGES
);

CREATE OPERATOR ~~*(
  FUNCTION=eql_v2."~~",
  LEFTARG=jsonb,
  RIGHTARG=eql_v2_encrypted,
  RESTRICT = eqsel,
  JOIN = eqjoinsel,
  HASHES,
  MERGES
);


-- -----------------------------------------------------------------------------

-- order_by function for ordering when operators are not available.
--
--
CREATE FUNCTION eql_v2.order_by(a eql_v2_encrypted)
  RETURNS eql_v2.ore_block_u64_8_256
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN eql_v2.ore_block_u64_8_256(a);
  END;
$$ LANGUAGE plpgsql;





--------------------

CREATE OPERATOR FAMILY eql_v2.encrypted_operator_family USING btree;

CREATE OPERATOR CLASS eql_v2.encrypted_operator_class DEFAULT FOR TYPE eql_v2_encrypted USING btree FAMILY eql_v2.encrypted_operator_family AS
  OPERATOR 1 <,
  OPERATOR 2 <=,
  OPERATOR 3 =,
  OPERATOR 4 >=,
  OPERATOR 5 >,
  FUNCTION 1 eql_v2.compare(a eql_v2_encrypted, b eql_v2_encrypted);


--------------------

-- CREATE OPERATOR FAMILY eql_v2.encrypted_operator_ordered USING btree;

-- CREATE OPERATOR CLASS eql_v2.encrypted_operator_ordered FOR TYPE eql_v2_encrypted USING btree FAMILY eql_v2.encrypted_operator_ordered AS
--   OPERATOR 1 <,
--   OPERATOR 2 <=,
--   OPERATOR 3 =,
--   OPERATOR 4 >=,
--   OPERATOR 5 >,
--   FUNCTION 1 eql_v2.compare_ore_block_u64_8_256(a eql_v2_encrypted, b eql_v2_encrypted);

--------------------

-- CREATE OPERATOR FAMILY eql_v2.encrypted_hmac_256_operator USING btree;

-- CREATE OPERATOR CLASS eql_v2.encrypted_hmac_256_operator FOR TYPE eql_v2_encrypted USING btree FAMILY eql_v2.encrypted_hmac_256_operator AS
--   OPERATOR 1 <,
--   OPERATOR 2 <=,
--   OPERATOR 3 =,
--   OPERATOR 4 >=,
--   OPERATOR 5 >,
--   FUNCTION 1 eql_v2.compare_hmac(a eql_v2_encrypted, b eql_v2_encrypted);




CREATE FUNCTION eql_v2."@>"(a eql_v2_encrypted, b eql_v2_encrypted)
RETURNS boolean AS $$
  SELECT eql_v2.ste_vec_contains(a, b)
$$ LANGUAGE SQL;

CREATE OPERATOR @>(
  FUNCTION=eql_v2."@>",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=eql_v2_encrypted
);



CREATE FUNCTION eql_v2."<@"(a eql_v2_encrypted, b eql_v2_encrypted)
RETURNS boolean AS $$
  -- Contains with reversed arguments
  SELECT eql_v2.ste_vec_contains(b, a)
$$ LANGUAGE SQL;

CREATE OPERATOR <@(
  FUNCTION=eql_v2."<@",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=eql_v2_encrypted
);


-- Operators for <> not equal comparisons of eql_v2_encrypted types
--
-- Uses `eql_v2.compare` for the actual comparison logic.
--
--
CREATE FUNCTION eql_v2.neq(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN eql_v2.compare(a, b) <> 0;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2."<>"(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN eql_v2.neq(a, b );
  END;
$$ LANGUAGE plpgsql;


CREATE OPERATOR <> (
  FUNCTION=eql_v2."<>",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=eql_v2_encrypted,
  NEGATOR = =,
  RESTRICT = eqsel,
  JOIN = eqjoinsel,
  HASHES,
  MERGES
);


CREATE FUNCTION eql_v2."<>"(a eql_v2_encrypted, b jsonb)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN eql_v2.neq(a, b::eql_v2_encrypted);
  END;
$$ LANGUAGE plpgsql;

CREATE OPERATOR <> (
  FUNCTION=eql_v2."<>",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=jsonb,
  NEGATOR = =,
  RESTRICT = eqsel,
  JOIN = eqjoinsel,
  HASHES,
  MERGES
);



CREATE FUNCTION eql_v2."<>"(a jsonb, b eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN eql_v2.neq(a::eql_v2_encrypted, b);
  END;
$$ LANGUAGE plpgsql;

CREATE OPERATOR <> (
  FUNCTION=eql_v2."<>",
  LEFTARG=jsonb,
  RIGHTARG=eql_v2_encrypted,
  NEGATOR = =,
  RESTRICT = eqsel,
  JOIN = eqjoinsel,
  HASHES,
  MERGES
);







CREATE FUNCTION eql_v2."->>"(e eql_v2_encrypted, selector text)
  RETURNS text
IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    found eql_v2_encrypted;
	BEGIN
    -- found = eql_v2."->"(e, selector);
    -- RETURN eql_v2.ciphertext(found);
    RETURN eql_v2."->"(e, selector);
  END;
$$ LANGUAGE plpgsql;


CREATE OPERATOR ->> (
  FUNCTION=eql_v2."->>",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=text
);



---------------------------------------------------


CREATE FUNCTION eql_v2."->>"(e eql_v2_encrypted, selector eql_v2_encrypted)
  RETURNS text
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN eql_v2."->>"(e, eql_v2.selector(selector));
  END;
$$ LANGUAGE plpgsql;


CREATE OPERATOR ->> (
  FUNCTION=eql_v2."->>",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=eql_v2_encrypted
);


--
-- The -> operator returns an encrypted matching the provided selector
--
-- Encyprted JSON is represented as an array of `eql_v2_encrypted`.
-- Each `eql_v2_encrypted` value has a selector, ciphertext, and an index term
--
--     {
--       "sv": [ {"c": "", "s": "", "b3": "" } ]
--     }
--
-- Note on oeprator resolution:
--   Assignment casts are considered for operator resolution (see PostgreSQL docs),
--   the system may pick the "more specific" one, which is the one with both arguments of the same type.
--
-- This means that to use the text operator, the parameter will need to be cast to text
--
CREATE FUNCTION eql_v2."->"(e eql_v2_encrypted, selector text)
  RETURNS eql_v2_encrypted
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    meta jsonb;
    sv eql_v2_encrypted[];
    found jsonb;
	BEGIN

    IF e IS NULL THEN
      RETURN NULL;
    END IF;

    -- Column identifier and version
    meta := eql_v2.meta_data(e);

    sv := eql_v2.ste_vec(e);

    FOR idx IN 1..array_length(sv, 1) LOOP
      if eql_v2.selector(sv[idx]) = selector THEN
        found := sv[idx];
      END IF;
    END LOOP;

    RETURN (meta || found)::eql_v2_encrypted;
  END;
$$ LANGUAGE plpgsql;


CREATE OPERATOR ->(
  FUNCTION=eql_v2."->",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=text
);

---------------------------------------------------


CREATE FUNCTION eql_v2."->"(e eql_v2_encrypted, selector eql_v2_encrypted)
  RETURNS eql_v2_encrypted
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN
    RETURN eql_v2."->"(e, eql_v2.selector(selector));
  END;
$$ LANGUAGE plpgsql;



CREATE OPERATOR ->(
  FUNCTION=eql_v2."->",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=eql_v2_encrypted
);


---------------------------------------------------


CREATE FUNCTION eql_v2."->"(e eql_v2_encrypted, selector integer)
  RETURNS eql_v2_encrypted
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    sv eql_v2_encrypted[];
    found eql_v2_encrypted;
	BEGIN
    IF NOT eql_v2.is_ste_vec_array(e) THEN
      RETURN NULL;
    END IF;

    sv := eql_v2.ste_vec(e);

    -- PostgreSQL arrays are 1-based
    -- JSONB arrays are 0-based and so the selector is 0-based
    FOR idx IN 1..array_length(sv, 1) LOOP
      if (idx-1) = selector THEN
        found := sv[idx];
      END IF;
    END LOOP;

    RETURN found;
  END;
$$ LANGUAGE plpgsql;





CREATE OPERATOR ->(
  FUNCTION=eql_v2."->",
  LEFTARG=eql_v2_encrypted,
  RIGHTARG=integer
);


-- The jsonpath operators @? and @@ suppress the following errors:
--      missing object field or array element,
--      unexpected JSON item type,
--      datetime and numeric errors.
-- The jsonpath-related functions described below can also be told to suppress these types of errors.
-- This behavior might be helpful when searching JSON document collections of varying structure.



--
--
-- Returns the stevec encrypted element matching the selector
--
-- If the selector is not found, the function returns NULL
-- If the selector is found, the function returns the matching element
--
-- Array elements use the same selector
-- Multiple matching elements are wrapped into an eql_v2_encrypted with an array flag
--
--

CREATE FUNCTION eql_v2.jsonb_path_query(val jsonb, selector text)
  RETURNS SETOF eql_v2_encrypted
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    sv eql_v2_encrypted[];
    found jsonb[];
    e jsonb;
    meta jsonb;
    ary boolean;
  BEGIN

    IF val IS NULL THEN
      RETURN NEXT NULL;
    END IF;

    -- Column identifier and version
    meta := eql_v2.meta_data(val);

    sv := eql_v2.ste_vec(val);

    FOR idx IN 1..array_length(sv, 1) LOOP
      e := sv[idx];

      IF eql_v2.selector(e) = selector THEN
        found := array_append(found, e);
        IF eql_v2.is_ste_vec_array(e) THEN
          ary := true;
        END IF;

      END IF;
    END LOOP;

    IF found IS NOT NULL THEN

      IF ary THEN
        -- Wrap found array elements as eql_v2_encrypted

        RETURN NEXT (meta || jsonb_build_object(
          'sv', found,
          'a', 1
        ))::eql_v2_encrypted;

      ELSE
        RETURN NEXT (meta || found[1])::eql_v2_encrypted;
      END IF;

    END IF;

    RETURN;
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.jsonb_path_query(val eql_v2_encrypted, selector eql_v2_encrypted)
  RETURNS SETOF eql_v2_encrypted
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN QUERY
    SELECT * FROM eql_v2.jsonb_path_query(val.data, eql_v2.selector(selector));
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.jsonb_path_query(val eql_v2_encrypted, selector text)
  RETURNS SETOF eql_v2_encrypted
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN QUERY
    SELECT * FROM eql_v2.jsonb_path_query(val.data, selector);
  END;
$$ LANGUAGE plpgsql;


------------------------------------------------------------------------------------


CREATE FUNCTION eql_v2.jsonb_path_exists(val jsonb, selector text)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN EXISTS (
      SELECT eql_v2.jsonb_path_query(val, selector)
    );
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.jsonb_path_exists(val eql_v2_encrypted, selector eql_v2_encrypted)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN EXISTS (
      SELECT eql_v2.jsonb_path_query(val, eql_v2.selector(selector))
    );
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.jsonb_path_exists(val eql_v2_encrypted, selector text)
  RETURNS boolean
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN EXISTS (
      SELECT eql_v2.jsonb_path_query(val, selector)
    );
  END;
$$ LANGUAGE plpgsql;


------------------------------------------------------------------------------------


CREATE FUNCTION eql_v2.jsonb_path_query_first(val jsonb, selector text)
  RETURNS eql_v2_encrypted
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN (
      SELECT (
        SELECT e
        FROM eql_v2.jsonb_path_query(val.data, selector) AS e
        LIMIT 1
      )
    );
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.jsonb_path_query_first(val eql_v2_encrypted, selector eql_v2_encrypted)
  RETURNS eql_v2_encrypted
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN (
        SELECT e
        FROM eql_v2.jsonb_path_query(val.data, eql_v2.selector(selector)) as e
        LIMIT 1
    );
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.jsonb_path_query_first(val eql_v2_encrypted, selector text)
  RETURNS eql_v2_encrypted
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN (
        SELECT e
        FROM eql_v2.jsonb_path_query(val.data, selector) as e
        LIMIT 1
    );
  END;
$$ LANGUAGE plpgsql;



------------------------------------------------------------------------------------


-- =====================================================================
--
-- Returns the length of an encrypted jsonb array
---
-- An encrypted is a jsonb array if it contains an "a" field/attribute with a truthy value
--

CREATE FUNCTION eql_v2.jsonb_array_length(val jsonb)
  RETURNS integer
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    sv eql_v2_encrypted[];
    found eql_v2_encrypted[];
  BEGIN

    IF val IS NULL THEN
      RETURN NULL;
    END IF;

    IF eql_v2.is_ste_vec_array(val) THEN
      sv := eql_v2.ste_vec(val);
      RETURN array_length(sv, 1);
    END IF;

    RAISE 'cannot get array length of a non-array';
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.jsonb_array_length(val eql_v2_encrypted)
  RETURNS integer
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN (
      SELECT eql_v2.jsonb_array_length(val.data)
    );
  END;
$$ LANGUAGE plpgsql;




-- =====================================================================
--
-- Returns the length of an encrypted jsonb array
---
-- An encrypted is a jsonb array if it contains an "a" field/attribute with a truthy value
--

CREATE FUNCTION eql_v2.jsonb_array_elements(val jsonb)
  RETURNS SETOF eql_v2_encrypted
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    sv eql_v2_encrypted[];
    meta jsonb;
    item jsonb;
  BEGIN

    IF NOT eql_v2.is_ste_vec_array(val) THEN
      RAISE 'cannot extract elements from non-array';
    END IF;

    -- Column identifier and version
    meta := eql_v2.meta_data(val);

    sv := eql_v2.ste_vec(val);

    FOR idx IN 1..array_length(sv, 1) LOOP
      item = sv[idx];
      RETURN NEXT (meta || item)::eql_v2_encrypted;
    END LOOP;

    RETURN;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.jsonb_array_elements(val eql_v2_encrypted)
  RETURNS SETOF eql_v2_encrypted
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN QUERY
      SELECT * FROM eql_v2.jsonb_array_elements(val.data);
  END;
$$ LANGUAGE plpgsql;



-- =====================================================================
--
-- Returns the length of an encrypted jsonb array
---
-- An encrypted is a jsonb array if it contains an "a" field/attribute with a truthy value
--

CREATE FUNCTION eql_v2.jsonb_array_elements_text(val jsonb)
  RETURNS SETOF text
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    sv eql_v2_encrypted[];
    found eql_v2_encrypted[];
  BEGIN
    IF NOT eql_v2.is_ste_vec_array(val) THEN
      RAISE 'cannot extract elements from non-array';
    END IF;

    sv := eql_v2.ste_vec(val);

    FOR idx IN 1..array_length(sv, 1) LOOP
      RETURN NEXT eql_v2.ciphertext(sv[idx]);
    END LOOP;

    RETURN;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.jsonb_array_elements_text(val eql_v2_encrypted)
  RETURNS SETOF text
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN QUERY
      SELECT * FROM eql_v2.jsonb_array_elements_text(val.data);
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.compare_hmac_256(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS integer
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    a_term eql_v2.hmac_256;
    b_term eql_v2.hmac_256;
  BEGIN

    IF a IS NULL AND b IS NULL THEN
      RETURN 0;
    END IF;

    IF a IS NULL THEN
      RETURN -1;
    END IF;

    IF b IS NULL THEN
      RETURN 1;
    END IF;

    IF eql_v2.has_hmac_256(a) THEN
      a_term = eql_v2.hmac_256(a);
    END IF;

    IF eql_v2.has_hmac_256(b) THEN
      b_term = eql_v2.hmac_256(b);
    END IF;

    IF a_term IS NULL AND b_term IS NULL THEN
      RETURN 0;
    END IF;

    IF a_term IS NULL THEN
      RETURN -1;
    END IF;

    IF b_term IS NULL THEN
      RETURN 1;
    END IF;

    -- Using the underlying text type comparison
    IF a_term = b_term THEN
      RETURN 0;
    END IF;

    IF a_term < b_term THEN
      RETURN -1;
    END IF;

    IF a_term > b_term THEN
      RETURN 1;
    END IF;

  END;
$$ LANGUAGE plpgsql;
-- Return the diff of two configurations
-- Returns the set of keys in a that have different values to b
-- The json comparison is on object values held by the key

CREATE FUNCTION eql_v2.diff_config(a JSONB, b JSONB)
	RETURNS TABLE(table_name TEXT, column_name TEXT)
IMMUTABLE STRICT PARALLEL SAFE
AS $$
  BEGIN
    RETURN QUERY
    WITH table_keys AS (
      SELECT jsonb_object_keys(a->'tables') AS key
      UNION
      SELECT jsonb_object_keys(b->'tables') AS key
    ),
    column_keys AS (
      SELECT tk.key AS table_key, jsonb_object_keys(a->'tables'->tk.key) AS column_key
      FROM table_keys tk
      UNION
      SELECT tk.key AS table_key, jsonb_object_keys(b->'tables'->tk.key) AS column_key
      FROM table_keys tk
    )
    SELECT
      ck.table_key AS table_name,
      ck.column_key AS column_name
    FROM
      column_keys ck
    WHERE
      (a->'tables'->ck.table_key->ck.column_key IS DISTINCT FROM b->'tables'->ck.table_key->ck.column_key);
  END;
$$ LANGUAGE plpgsql;


-- Returns the set of columns with pending configuration changes
-- Compares the columns in pending configuration that do not match the active config

CREATE FUNCTION eql_v2.select_pending_columns()
	RETURNS TABLE(table_name TEXT, column_name TEXT)
AS $$
	DECLARE
		active JSONB;
		pending JSONB;
		config_id BIGINT;
	BEGIN
		SELECT data INTO active FROM eql_v2_configuration WHERE state = 'active';

		-- set default config
    IF active IS NULL THEN
      active := '{}';
    END IF;

		SELECT id, data INTO config_id, pending FROM eql_v2_configuration WHERE state = 'pending';

		-- set default config
		IF config_id IS NULL THEN
			RAISE EXCEPTION 'No pending configuration exists to encrypt';
		END IF;

		RETURN QUERY
		SELECT d.table_name, d.column_name FROM eql_v2.diff_config(active, pending) as d;
	END;
$$ LANGUAGE plpgsql;

--
-- Returns the target columns with pending configuration
--
-- A `pending` column may be either a plaintext variant or eql_v2_encrypted.
-- A `target` column is always of type eql_v2_encrypted
--
-- On initial encryption from plaintext the target column will be `{column_name}_encrypted `
-- OR NULL if the column does not exist
--

CREATE FUNCTION eql_v2.select_target_columns()
	RETURNS TABLE(table_name TEXT, column_name TEXT, target_column TEXT)
	STABLE STRICT PARALLEL SAFE
AS $$
  SELECT
    c.table_name,
    c.column_name,
    s.column_name as target_column
  FROM
    eql_v2.select_pending_columns() c
  LEFT JOIN information_schema.columns s ON
    s.table_name = c.table_name AND
    (s.column_name = c.column_name OR s.column_name = c.column_name || '_encrypted') AND
    s.udt_name = 'eql_v2_encrypted';
$$ LANGUAGE sql;


--
-- Returns true if all pending columns have a target (encrypted) column

CREATE FUNCTION eql_v2.ready_for_encryption()
	RETURNS BOOLEAN
	STABLE STRICT PARALLEL SAFE
AS $$
	SELECT EXISTS (
	  SELECT *
	  FROM eql_v2.select_target_columns() AS c
	  WHERE c.target_column IS NOT NULL);
$$ LANGUAGE sql;


--
-- Creates eql_v2_encrypted columns for any plaintext columns with pending configuration
-- The new column name is `{column_name}_encrypted`
--
-- Executes the ALTER TABLE statement
--   `ALTER TABLE {target_table} ADD COLUMN {column_name}_encrypted eql_v2_encrypted;`
--

CREATE FUNCTION eql_v2.create_encrypted_columns()
	RETURNS TABLE(table_name TEXT, column_name TEXT)
AS $$
	BEGIN
    FOR table_name, column_name IN
      SELECT c.table_name, (c.column_name || '_encrypted') FROM eql_v2.select_target_columns() AS c WHERE c.target_column IS NULL
    LOOP
		  EXECUTE format('ALTER TABLE %I ADD column %I eql_v2_encrypted;', table_name, column_name);
      RETURN NEXT;
    END LOOP;
	END;
$$ LANGUAGE plpgsql;


--
-- Renames plaintext and eql_v2_encrypted columns created for the initial encryption.
-- The source plaintext column is renamed to `{column_name}_plaintext`
-- The target encrypted column is renamed from `{column_name}_encrypted` to `{column_name}`
--
-- Executes the ALTER TABLE statements
--   `ALTER TABLE {target_table} RENAME COLUMN {column_name} TO {column_name}_plaintext;
--   `ALTER TABLE {target_table} RENAME COLUMN {column_name}_encrypted TO {column_name};`
--

CREATE FUNCTION eql_v2.rename_encrypted_columns()
	RETURNS TABLE(table_name TEXT, column_name TEXT, target_column TEXT)
AS $$
	BEGIN
    FOR table_name, column_name, target_column IN
      SELECT * FROM eql_v2.select_target_columns() as c WHERE c.target_column = c.column_name || '_encrypted'
    LOOP
		  EXECUTE format('ALTER TABLE %I RENAME %I TO %I;', table_name, column_name, column_name || '_plaintext');
		  EXECUTE format('ALTER TABLE %I RENAME %I TO %I;', table_name, target_column, column_name);
      RETURN NEXT;
    END LOOP;
	END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.count_encrypted_with_active_config(table_name TEXT, column_name TEXT)
  RETURNS BIGINT
AS $$
DECLARE
  result BIGINT;
BEGIN
	EXECUTE format(
        'SELECT COUNT(%I) FROM %s t WHERE %I->>%L = (SELECT id::TEXT FROM eql_v2_configuration WHERE state = %L)',
        column_name, table_name, column_name, 'v', 'active'
    )
	INTO result;
  	RETURN result;
END;
$$ LANGUAGE plpgsql;



-- Should include an ident field
CREATE FUNCTION eql_v2._encrypted_check_i(val jsonb)
  RETURNS boolean
AS $$
	BEGIN
    IF val ? 'i' THEN
      RETURN true;
    END IF;
    RAISE 'Encrypted column missing ident (i) field: %', val;
  END;
$$ LANGUAGE plpgsql;


-- Ident field should include table and column
CREATE FUNCTION eql_v2._encrypted_check_i_ct(val jsonb)
  RETURNS boolean
AS $$
	BEGIN
    IF (val->'i' ?& array['t', 'c']) THEN
      RETURN true;
    END IF;
    RAISE 'Encrypted column ident (i) missing table (t) or column (c) fields: %', val;
  END;
$$ LANGUAGE plpgsql;

-- -- Should include a version field
CREATE FUNCTION eql_v2._encrypted_check_v(val jsonb)
  RETURNS boolean
AS $$
	BEGIN
    IF (val ? 'v') THEN

      IF val->>'v' <> '2' THEN
        RAISE 'Expected encrypted column version (v) 2';
        RETURN false;
      END IF;

      RETURN true;
    END IF;
    RAISE 'Encrypted column missing version (v) field: %', val;
  END;
$$ LANGUAGE plpgsql;


-- -- Should include a ciphertext field
CREATE FUNCTION eql_v2._encrypted_check_c(val jsonb)
  RETURNS boolean
AS $$
	BEGIN
    IF (val ? 'c') THEN
      RETURN true;
    END IF;
    RAISE 'Encrypted column missing ciphertext (c) field: %', val;
  END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION eql_v2.check_encrypted(val jsonb)
  RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
BEGIN ATOMIC
    RETURN (
      eql_v2._encrypted_check_v(val) AND
      eql_v2._encrypted_check_c(val) AND
      eql_v2._encrypted_check_i(val) AND
      eql_v2._encrypted_check_i_ct(val)
    );
END;


CREATE FUNCTION eql_v2.check_encrypted(val eql_v2_encrypted)
  RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
BEGIN ATOMIC
    RETURN eql_v2.check_encrypted(val.data);
END;


-- Aggregate functions for ORE

CREATE FUNCTION eql_v2.min(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS eql_v2_encrypted
STRICT
AS $$
  BEGIN
    IF a < b THEN
      RETURN a;
    ELSE
      RETURN b;
    END IF;
  END;
$$ LANGUAGE plpgsql;


CREATE AGGREGATE eql_v2.min(eql_v2_encrypted)
(
  sfunc = eql_v2.min,
  stype = eql_v2_encrypted
);


CREATE FUNCTION eql_v2.max(a eql_v2_encrypted, b eql_v2_encrypted)
RETURNS eql_v2_encrypted
STRICT
AS $$
  BEGIN
    IF a > b THEN
      RETURN a;
    ELSE
      RETURN b;
    END IF;
  END;
$$ LANGUAGE plpgsql;


CREATE AGGREGATE eql_v2.max(eql_v2_encrypted)
(
  sfunc = eql_v2.max,
  stype = eql_v2_encrypted
);


--
-- Define partial indexes to ensure that there is only one active, pending and encrypting config at a time
--
CREATE UNIQUE INDEX ON public.eql_v2_configuration (state) WHERE state = 'active';
CREATE UNIQUE INDEX ON public.eql_v2_configuration (state) WHERE state = 'pending';
CREATE UNIQUE INDEX ON public.eql_v2_configuration (state) WHERE state = 'encrypting';



-- Customer-facing configuration functions
-- Depends on private functions for implemenation
--
--

--
-- Adds an index term to the configuration
--

CREATE FUNCTION eql_v2.add_search_config(table_name text, column_name text, index_name text, cast_as text DEFAULT 'text', opts jsonb DEFAULT '{}', migrating boolean DEFAULT false)
  RETURNS jsonb

AS $$
  DECLARE
    o jsonb;
    _config jsonb;
  BEGIN

    -- set the active config
    SELECT data INTO _config FROM public.eql_v2_configuration WHERE state = 'active' OR state = 'pending' ORDER BY state DESC;

    -- if index exists
    IF _config #> array['tables', table_name, column_name, 'indexes'] ?  index_name THEN
      RAISE EXCEPTION '% index exists for column: % %', index_name, table_name, column_name;
    END IF;

    IF NOT cast_as = ANY('{text, int, small_int, big_int, real, double, boolean, date, jsonb}') THEN
      RAISE EXCEPTION '% is not a valid cast type', cast_as;
    END IF;

    -- set default config
    SELECT eql_v2.config_default(_config) INTO _config;

    SELECT eql_v2.config_add_table(table_name, _config) INTO _config;

    SELECT eql_v2.config_add_column(table_name, column_name, _config) INTO _config;

    SELECT eql_v2.config_add_cast(table_name, column_name, cast_as, _config) INTO _config;

    -- set default options for index if opts empty
    IF index_name = 'match' AND opts = '{}' THEN
      SELECT eql_v2.config_match_default() INTO opts;
    END IF;

    SELECT eql_v2.config_add_index(table_name, column_name, index_name, opts, _config) INTO _config;

    --  create a new pending record if we don't have one
    INSERT INTO public.eql_v2_configuration (state, data) VALUES ('pending', _config)
    ON CONFLICT (state)
      WHERE state = 'pending'
    DO UPDATE
      SET data = _config;

    IF NOT migrating THEN
      PERFORM eql_v2.migrate_config();
      PERFORM eql_v2.activate_config();
    END IF;

    -- PERFORM eql_v2.add_encrypted_constraint(table_name, column_name);

    -- exeunt
    RETURN _config;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.remove_search_config(table_name text, column_name text, index_name text, migrating boolean DEFAULT false)
  RETURNS jsonb
AS $$
  DECLARE
    _config jsonb;
  BEGIN

    -- set the active config
    SELECT data INTO _config FROM public.eql_v2_configuration WHERE state = 'active' OR state = 'pending' ORDER BY state DESC;

    -- if no config
    IF _config IS NULL THEN
      RAISE EXCEPTION 'No active or pending configuration exists';
    END IF;

    -- if the table doesn't exist
    IF NOT _config #> array['tables'] ? table_name THEN
      RAISE EXCEPTION 'No configuration exists for table: %', table_name;
    END IF;

    -- if the index does not exist
    -- IF NOT _config->key ? index_name THEN
    IF NOT _config #> array['tables', table_name] ?  column_name THEN
      RAISE EXCEPTION 'No % index exists for column: % %', index_name, table_name, column_name;
    END IF;

    --  create a new pending record if we don't have one
    INSERT INTO public.eql_v2_configuration (state, data) VALUES ('pending', _config)
    ON CONFLICT (state)
      WHERE state = 'pending'
    DO NOTHING;

    -- remove the index
    SELECT _config #- array['tables', table_name, column_name, 'indexes', index_name] INTO _config;

    -- update the config and migrate (even if empty)
    UPDATE public.eql_v2_configuration SET data = _config WHERE state = 'pending';
    
    IF NOT migrating THEN
      PERFORM eql_v2.migrate_config();
      PERFORM eql_v2.activate_config();
    END IF;

    -- exeunt
    RETURN _config;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.modify_search_config(table_name text, column_name text, index_name text, cast_as text DEFAULT 'text', opts jsonb DEFAULT '{}', migrating boolean DEFAULT false)
  RETURNS jsonb
AS $$
  BEGIN
    PERFORM eql_v2.remove_search_config(table_name, column_name, index_name, migrating);
    RETURN eql_v2.add_search_config(table_name, column_name, index_name, cast_as, opts, migrating);
  END;
$$ LANGUAGE plpgsql;



--
--
-- Marks the currently `pending` configuration as `encrypting`.
--
-- Validates the database schema and raises an exception if the configured columns are not `cs_encrypted_v2` type.
--
-- Accepts an optional `force` parameter.
-- If `force` is `true`, the schema validation is skipped.
--
-- Raises an exception if the configuration is already `encrypting` or if there is no `pending` configuration to encrypt.
--

CREATE FUNCTION eql_v2.migrate_config()
  RETURNS boolean
AS $$
	BEGIN

    IF EXISTS (SELECT FROM public.eql_v2_configuration c WHERE c.state = 'encrypting') THEN
      RAISE EXCEPTION 'An encryption is already in progress';
    END IF;

		IF NOT EXISTS (SELECT FROM public.eql_v2_configuration c WHERE c.state = 'pending') THEN
			RAISE EXCEPTION 'No pending configuration exists to encrypt';
		END IF;

    IF NOT eql_v2.ready_for_encryption() THEN
      RAISE EXCEPTION 'Some pending columns do not have an encrypted target';
    END IF;

    UPDATE public.eql_v2_configuration SET state = 'encrypting' WHERE state = 'pending';
		RETURN true;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.activate_config()
  RETURNS boolean
AS $$
	BEGIN

	  IF EXISTS (SELECT FROM public.eql_v2_configuration c WHERE c.state = 'encrypting') THEN
	  	UPDATE public.eql_v2_configuration SET state = 'inactive' WHERE state = 'active';
			UPDATE public.eql_v2_configuration SET state = 'active' WHERE state = 'encrypting';
			RETURN true;
		ELSE
			RAISE EXCEPTION 'No encrypting configuration exists to activate';
		END IF;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.discard()
  RETURNS boolean
AS $$
  BEGIN
    IF EXISTS (SELECT FROM public.eql_v2_configuration c WHERE c.state = 'pending') THEN
        DELETE FROM public.eql_v2_configuration WHERE state = 'pending';
      RETURN true;
    ELSE
      RAISE EXCEPTION 'No pending configuration exists to discard';
    END IF;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.add_column(table_name text, column_name text, cast_as text DEFAULT 'text', migrating boolean DEFAULT false)
  RETURNS jsonb
AS $$
  DECLARE
    key text;
    _config jsonb;
  BEGIN
    -- set the active config
    SELECT data INTO _config FROM public.eql_v2_configuration WHERE state = 'active' OR state = 'pending' ORDER BY state DESC;

    -- set default config
    SELECT eql_v2.config_default(_config) INTO _config;

    -- if index exists
    IF _config #> array['tables', table_name] ?  column_name THEN
      RAISE EXCEPTION 'Config exists for column: % %', table_name, column_name;
    END IF;

    SELECT eql_v2.config_add_table(table_name, _config) INTO _config;

    SELECT eql_v2.config_add_column(table_name, column_name, _config) INTO _config;

    SELECT eql_v2.config_add_cast(table_name, column_name, cast_as, _config) INTO _config;

    --  create a new pending record if we don't have one
    INSERT INTO public.eql_v2_configuration (state, data) VALUES ('pending', _config)
    ON CONFLICT (state)
      WHERE state = 'pending'
    DO UPDATE
      SET data = _config;

    IF NOT migrating THEN
      PERFORM eql_v2.migrate_config();
      PERFORM eql_v2.activate_config();
    END IF;

    PERFORM eql_v2.add_encrypted_constraint(table_name, column_name);

    -- exeunt
    RETURN _config;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.remove_column(table_name text, column_name text, migrating boolean DEFAULT false)
  RETURNS jsonb
AS $$
  DECLARE
    key text;
    _config jsonb;
  BEGIN
     -- set the active config
    SELECT data INTO _config FROM public.eql_v2_configuration WHERE state = 'active' OR state = 'pending' ORDER BY state DESC;

    -- if no config
    IF _config IS NULL THEN
      RAISE EXCEPTION 'No active or pending configuration exists';
    END IF;

    -- if the table doesn't exist
    IF NOT _config #> array['tables'] ? table_name THEN
      RAISE EXCEPTION 'No configuration exists for table: %', table_name;
    END IF;

    -- if the column does not exist
    IF NOT _config #> array['tables', table_name] ?  column_name THEN
      RAISE EXCEPTION 'No configuration exists for column: % %', table_name, column_name;
    END IF;

    --  create a new pending record if we don't have one
    INSERT INTO public.eql_v2_configuration (state, data) VALUES ('pending', _config)
    ON CONFLICT (state)
      WHERE state = 'pending'
    DO NOTHING;

    -- remove the column
    SELECT _config #- array['tables', table_name, column_name] INTO _config;

    -- if table  is now empty, remove the table
    IF _config #> array['tables', table_name] = '{}' THEN
      SELECT _config #- array['tables', table_name] INTO _config;
    END IF;

    PERFORM eql_v2.remove_encrypted_constraint(table_name, column_name);

    -- update the config (even if empty) and activate
    UPDATE public.eql_v2_configuration SET data = _config WHERE state = 'pending';
    
    IF NOT migrating THEN
      -- For empty configs, skip migration validation and directly activate
      IF _config #> array['tables'] = '{}' THEN
        UPDATE public.eql_v2_configuration SET state = 'inactive' WHERE state = 'active';
        UPDATE public.eql_v2_configuration SET state = 'active' WHERE state = 'pending';
      ELSE
        PERFORM eql_v2.migrate_config();
        PERFORM eql_v2.activate_config();
      END IF;
    END IF;

    -- exeunt
    RETURN _config;

  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.reload_config()
  RETURNS void
LANGUAGE sql STRICT PARALLEL SAFE
BEGIN ATOMIC
  RETURN NULL;
END;


-- A convenience function to return the configuration in a tabular format, allowing for easier filtering, and querying.
-- Query using `SELECT * FROM cs_config();`
--
CREATE FUNCTION eql_v2.config() RETURNS TABLE (
    state eql_v2_configuration_state,
    relation text,
    col_name text,
    decrypts_as text,
    indexes jsonb
)
AS $$
BEGIN
    RETURN QUERY
      WITH tables AS (
          SELECT config.state, tables.key AS table, tables.value AS config
          FROM public.eql_v2_configuration config, jsonb_each(data->'tables') tables
          WHERE config.data->>'v' = '1'
      )
      SELECT
          tables.state,
          tables.table,
          column_config.key,
          column_config.value->>'cast_as',
          column_config.value->'indexes'
      FROM tables, jsonb_each(tables.config) column_config;
END;
$$ LANGUAGE plpgsql;

--
-- Extracts index keys/names from configuration json
--
-- Used by the eql_v2.config_check_indexes as part of the configuration_data_v2 constraint
--
CREATE FUNCTION eql_v2.config_get_indexes(val jsonb)
    RETURNS SETOF text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
BEGIN ATOMIC
	SELECT jsonb_object_keys(jsonb_path_query(val,'$.tables.*.*.indexes'));
END;

--
-- _cs_check_config_get_indexes returns true if the table configuration only includes valid index types
--
-- Used by the cs_configuration_data_v2_check constraint
--
CREATE FUNCTION eql_v2.config_check_indexes(val jsonb)
  RETURNS BOOLEAN
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
	BEGIN

    IF (SELECT EXISTS (SELECT eql_v2.config_get_indexes(val))) THEN
      IF (SELECT bool_and(index = ANY('{match, ore, unique, ste_vec}')) FROM eql_v2.config_get_indexes(val) AS index) THEN
        RETURN true;
      END IF;
      RAISE 'Configuration has an invalid index (%). Index should be one of {match, ore, unique, ste_vec}', val;
    END IF;
    RETURN true;
  END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION eql_v2.config_check_cast(val jsonb)
  RETURNS BOOLEAN
AS $$
	BEGIN
    -- If there are cast_as fields, validate them
    IF EXISTS (SELECT jsonb_array_elements_text(jsonb_path_query_array(val, '$.tables.*.*.cast_as'))) THEN
      IF (SELECT bool_and(cast_as = ANY('{text, int, small_int, big_int, real, double, boolean, date, jsonb}')) 
          FROM (SELECT jsonb_array_elements_text(jsonb_path_query_array(val, '$.tables.*.*.cast_as')) AS cast_as) casts) THEN
        RETURN true;
      END IF;
      RAISE 'Configuration has an invalid cast_as (%). Cast should be one of {text, int, small_int, big_int, real, double, boolean, date, jsonb}', val;
    END IF;
    -- If no cast_as fields exist (empty config), that's valid
    RETURN true;
  END;
$$ LANGUAGE plpgsql;

--
-- Should include a tables field
-- Tables should not be empty
CREATE FUNCTION eql_v2.config_check_tables(val jsonb)
  RETURNS boolean
AS $$
	BEGIN
    IF (val ? 'tables') THEN
      RETURN true;
    END IF;
    RAISE 'Configuration missing tables (tables) field: %', val;
  END;
$$ LANGUAGE plpgsql;

-- Should include a version field
CREATE FUNCTION eql_v2.config_check_version(val jsonb)
  RETURNS boolean
AS $$
	BEGIN
    IF (val ? 'v') THEN
      RETURN true;
    END IF;
    RAISE 'Configuration missing version (v) field: %', val;
  END;
$$ LANGUAGE plpgsql;


ALTER TABLE public.eql_v2_configuration DROP CONSTRAINT IF EXISTS eql_v2_configuration_data_check;

ALTER TABLE public.eql_v2_configuration
  ADD CONSTRAINT eql_v2_configuration_data_check CHECK (
    eql_v2.config_check_version(data) AND
    eql_v2.config_check_tables(data) AND
    eql_v2.config_check_cast(data) AND
    eql_v2.config_check_indexes(data)
);




CREATE FUNCTION eql_v2.compare_blake3(a eql_v2_encrypted, b eql_v2_encrypted)
  RETURNS integer
  IMMUTABLE STRICT PARALLEL SAFE
AS $$
  DECLARE
    a_term eql_v2.blake3;
    b_term eql_v2.blake3;
  BEGIN

    IF a IS NULL AND b IS NULL THEN
      RETURN 0;
    END IF;

    IF a IS NULL THEN
      RETURN -1;
    END IF;

    IF b IS NULL THEN
      RETURN 1;
    END IF;

    IF eql_v2.has_blake3(a) THEN
      a_term = eql_v2.blake3(a);
    END IF;

    IF eql_v2.has_blake3(b) THEN
      b_term = eql_v2.blake3(b);
    END IF;

    IF a_term IS NULL AND b_term IS NULL THEN
      RETURN 0;
    END IF;

    IF a_term IS NULL THEN
      RETURN -1;
    END IF;

    IF b_term IS NULL THEN
      RETURN 1;
    END IF;

    -- Using the underlying text type comparison
    IF a_term = b_term THEN
      RETURN 0;
    END IF;

    IF a_term < b_term THEN
      RETURN -1;
    END IF;

    IF a_term > b_term THEN
      RETURN 1;
    END IF;

  END;
$$ LANGUAGE plpgsql;
