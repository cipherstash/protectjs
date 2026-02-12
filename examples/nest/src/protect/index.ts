// Main module exports
export { EncryptionModule } from './protect.module'
export { EncryptionService } from './protect.service'

// Schema exports
export * from './schema'

// Decorator exports
export { Encrypt, EncryptModel } from './decorators/encrypt.decorator'
export { Decrypt, DecryptModel } from './decorators/decrypt.decorator'

// Interceptor exports
export { EncryptInterceptor } from './interceptors/encrypt.interceptor'
export { DecryptInterceptor } from './interceptors/decrypt.interceptor'

// Type exports
export type { EncryptionConfig } from './interfaces/protect-config.interface'
export { ENCRYPTION_CONFIG, ENCRYPTION_CLIENT } from './protect.constants'
