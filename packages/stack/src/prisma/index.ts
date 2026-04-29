/**
 * `@cipherstash/stack/prisma` — searchable, application-layer field-level
 * encryption for Prisma Next applications.
 *
 * Subpath imports are preferred over this barrel; they let bundlers
 * tree-shake the build-time / runtime / authoring surfaces independently.
 * This barrel exists for ergonomic access in test and prototype code only.
 *
 *   import cipherstashEncryption from '@cipherstash/stack/prisma/runtime'
 *   import cipherstashEncryptionControl from '@cipherstash/stack/prisma/control'
 *   import { encryptedString } from '@cipherstash/stack/prisma/column-types'
 *
 * See `notes/cipherstash-prisma-integration-plan-v2.md` for the full
 * design and phased rollout.
 */

export {
  encryptedBoolean,
  encryptedDate,
  encryptedJson,
  encryptedNumber,
  encryptedString,
} from './exports/column-types'
export type {
  EncryptedBooleanColumn,
  EncryptedBooleanConfig,
  EncryptedBooleanTypeParams,
  EncryptedDateColumn,
  EncryptedDateConfig,
  EncryptedDateTypeParams,
  EncryptedJsonColumn,
  EncryptedJsonConfig,
  EncryptedJsonTypeParams,
  EncryptedNumberColumn,
  EncryptedNumberConfig,
  EncryptedNumberTypeParams,
  EncryptedStringColumn,
  EncryptedStringConfig,
  EncryptedStringTypeParams,
  EncryptedTypeParams,
} from './exports/column-types'

export { cipherstashEncryption } from './exports/runtime'
export type {
  CipherStashEncryptionEvent,
  CipherStashEncryptionEventKind,
  CipherStashEncryptionOptions,
  ContractLike,
} from './exports/runtime'

export { cipherstashEncryptionControl } from './exports/control'

export { cipherstashPackMeta } from './core/descriptor-meta'

export type { CodecTypes, Decrypted, JsTypeFor } from './exports/codec-types'
export type { OperationTypes } from './exports/operation-types'

export { CipherStashCodecError } from './core/errors'
export type {
  CipherStashCodecErrorCode,
  CipherStashCodecErrorOptions,
} from './core/errors'
