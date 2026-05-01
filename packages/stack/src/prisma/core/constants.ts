/**
 * Stable identifiers for the CipherStash extension pack.
 *
 * Codec IDs follow Prisma Next's `namespace/name@version` convention. The
 * `cs/` namespace is owned by CipherStash; the suffix mirrors the EQL
 * extension's `eql_v2_*` SQL identifiers so codec IDs and SQL identifiers
 * stay aligned during planning and debugging.
 */

/** Storage codec for encrypted columns (round-trip via EQL composite literal). */
export const ENCRYPTED_STORAGE_CODEC_ID = 'cs/eql_v2_encrypted@1' as const

/** Query-term codec used on the value side of equality operators. */
export const ENCRYPTED_EQ_TERM_CODEC_ID = 'cs/eql_v2_eq_term@1' as const

/** Query-term codec used on the value side of free-text search operators. */
export const ENCRYPTED_MATCH_TERM_CODEC_ID = 'cs/eql_v2_match_term@1' as const

/** Query-term codec used on the value side of ORE (range/order) operators. */
export const ENCRYPTED_ORE_TERM_CODEC_ID = 'cs/eql_v2_ore_term@1' as const

/** Query-term codec used on the value side of JSONB path/selector operators. */
export const ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID =
  'cs/eql_v2_ste_vec_selector@1' as const

/**
 * Postgres-side native type for encrypted columns. Created by the EQL
 * install bundle as a composite type in the `public` schema; the migration
 * planner consumes the qualified identifier verbatim.
 */
export const ENCRYPTED_NATIVE_TYPE = '"public"."eql_v2_encrypted"' as const

/**
 * Contract scalar names registered by `defineCodecs`. Each codec advertises
 * exactly one scalar so the registry's `byScalar` mapping is unambiguous.
 */
export const ENCRYPTED_STORAGE_SCALAR = 'csEncrypted' as const
export const ENCRYPTED_EQ_TERM_SCALAR = 'csEncryptedEqTerm' as const
export const ENCRYPTED_MATCH_TERM_SCALAR = 'csEncryptedMatchTerm' as const
export const ENCRYPTED_ORE_TERM_SCALAR = 'csEncryptedOreTerm' as const
export const ENCRYPTED_STE_VEC_SELECTOR_SCALAR =
  'csEncryptedSteVecSelector' as const

/** Pack identity for the runtime / control extension descriptors. */
export const PACK_ID = 'cipherstash-encryption' as const
export const PACK_VERSION = '0.0.1' as const

/**
 * Plaintext data types supported by an encrypted column.
 *
 * Phase 2 widens beyond Phase 1's `'string'` to cover the four sibling
 * column-type factories (`encryptedNumber`, `encryptedDate`,
 * `encryptedBoolean`, `encryptedJson`). The data type drives:
 *   - The JS-side input/output type carried through `CodecTypes`.
 *   - The plaintext-encoding step in the storage codec's `encode` (Date is
 *     serialized to an ISO string before it crosses the FFI boundary;
 *     everything else is passed through).
 *   - The plaintext-decoding step in the storage codec's `decode` (a raw
 *     ISO string is rehydrated to a `Date` for `dataType: 'date'`; numeric
 *     strings are coerced for `'number'` if the FFI ever returns them as
 *     strings; everything else is returned as-is).
 */
export type EncryptedDataType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'json'
