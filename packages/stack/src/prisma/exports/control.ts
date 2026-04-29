import { ENCRYPTED_STORAGE_CODEC_ID } from '../core/constants'
import {
  getCipherStashDatabaseDependencies,
  planEncryptedTypeOperations,
} from '../core/database-dependencies'
import { cipherstashPackMeta } from '../core/descriptor-meta'
import { encryptedQueryOperations } from '../core/operation-templates'
import type {
  CodecControlHooks,
  SqlControlExtensionDescriptor,
} from '../internal-types/prisma-next'

/**
 * Build-time / migration-planner descriptor.
 *
 * Wires:
 *   - `databaseDependencies.init` from the vendored EQL install bundle
 *     (`core/eql-install.sql`). The migration planner runs this on
 *     first attach to a database.
 *   - `controlPlaneHooks[storage codec ID].planTypeOperations` so the
 *     planner emits per-column EQL search-index DDL whenever encrypted
 *     columns are added or their typeParams change.
 *
 * The descriptor's `version` is the pack-meta version verbatim. The
 * EQL bundle version is pinned at build time (`scripts/vendor-eql-install.ts`)
 * and surfaced separately in `databaseDependencies.init[*].install[*].meta.eqlBundleVersion`
 * so the migration planner can correlate installed-vs-target EQL
 * versions without conflating them with the pack version.
 */
const cipherstashControlPlaneHooks: CodecControlHooks = {
  planTypeOperations: planEncryptedTypeOperations,
}

const cipherstashEncryptionControl: SqlControlExtensionDescriptor<'postgres'> =
  {
    ...cipherstashPackMeta,
    types: {
      ...cipherstashPackMeta.types,
      codecTypes: {
        ...cipherstashPackMeta.types.codecTypes,
        controlPlaneHooks: {
          [ENCRYPTED_STORAGE_CODEC_ID]: cipherstashControlPlaneHooks,
        },
      },
    },
    queryOperations: () => encryptedQueryOperations,
    databaseDependencies: getCipherStashDatabaseDependencies(),
    create: () => ({
      familyId: 'sql' as const,
      targetId: 'postgres' as const,
    }),
  }

export { cipherstashEncryptionControl }
export default cipherstashEncryptionControl
