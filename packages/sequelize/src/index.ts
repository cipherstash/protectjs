// Main exports
export { createEncryptedType, getEncryptedColumnConfig } from './data-type'
export {
  extractProtectSchema,
  extractProtectSchemas,
} from './schema-extraction'
export { addProtectHooks } from './hooks'
export { verifyEqlType, ensureEqlType, getEqlTypeInfo } from './verify-type'
export {
  toComposite,
  fromComposite,
  bulkToComposite,
  bulkFromComposite,
} from './composite-type'

// Type exports
export type { EncryptedColumnConfig } from './types'
