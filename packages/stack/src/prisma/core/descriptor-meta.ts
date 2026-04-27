import {
  ENCRYPTED_NATIVE_TYPE,
  ENCRYPTED_STORAGE_CODEC_ID,
  PACK_ID,
  PACK_VERSION,
} from './constants'

/**
 * Pack-meta object referenced by both control and runtime descriptors.
 *
 * This mirrors the shape pgvector uses (`pgvectorPackMetaBase`): a single
 * `as const` literal that captures stable identity (kind / id / family /
 * target / version), capability flags, and the type-emission hints the
 * contract emitter needs to wire `OperationTypes` and `CodecTypes` into
 * generated `contract.d.ts` files.
 *
 * Phase 1 keeps `capabilities` minimal — there's nothing target-side to
 * negotiate yet. Phase 2 / 3 will surface searchable-encryption coverage
 * flags here so contract validation can refuse migrations that ask for
 * search-term combinations the deployment doesn't support.
 */
export const cipherstashPackMeta = {
  kind: 'extension',
  id: PACK_ID,
  familyId: 'sql',
  targetId: 'postgres',
  version: PACK_VERSION,
  capabilities: {
    postgres: {
      'cipherstash.encrypted': true,
    },
  },
  types: {
    codecTypes: {
      import: {
        package: '@cipherstash/stack/prisma/codec-types',
        named: 'CodecTypes',
        alias: 'CipherStashCodecTypes',
      },
      typeImports: [
        {
          package: '@cipherstash/stack/prisma/codec-types',
          named: 'JsTypeFor',
          alias: 'CipherStashJsTypeFor',
        },
      ],
    },
    operationTypes: {
      import: {
        package: '@cipherstash/stack/prisma/operation-types',
        named: 'OperationTypes',
        alias: 'CipherStashOperationTypes',
      },
    },
    storage: [
      {
        typeId: ENCRYPTED_STORAGE_CODEC_ID,
        familyId: 'sql',
        targetId: 'postgres',
        nativeType: ENCRYPTED_NATIVE_TYPE,
      },
    ],
  },
} as const
