import { type } from 'arktype'

/**
 * Arktype schema validating the `typeParams` carried on encrypted columns.
 *
 * Phase 2 widens beyond Phase 1's `dataType: 'string'` constraint to cover
 * every `EncryptedDataType`. The four searchable-encryption flags are
 * always present (defaulting to `false` from the column-type factories) so
 * the migration planner sees a uniform shape per column. The runtime
 * extension's `parameterizedCodecs()` declaration invokes this schema once
 * per column at context-creation time.
 *
 * Arktype is the convention for parameterized codecs in Prisma Next (see
 * pgvector's `vectorParamsSchema`). We carry the dependency for parity.
 */
export const encryptedStorageParamsSchema = type({
  dataType: "'string' | 'number' | 'boolean' | 'date' | 'json'",
  equality: 'boolean',
  freeTextSearch: 'boolean',
  orderAndRange: 'boolean',
  searchableJson: 'boolean',
})

export type EncryptedStorageParams = typeof encryptedStorageParamsSchema.infer
