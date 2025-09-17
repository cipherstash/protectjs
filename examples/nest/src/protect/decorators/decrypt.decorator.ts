import { type ExecutionContext, createParamDecorator } from '@nestjs/common'
import { getProtectService } from '../utils/get-protect-service.util'

import type {
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
  ProtectValue,
} from '@cipherstash/protect'

export interface DecryptOptions {
  table: ProtectTable<ProtectTableColumn>
  column: ProtectColumn | ProtectValue
  lockContext?: unknown // JWT or LockContext
}

/**
 * Decorator to automatically decrypt a field or entire object
 *
 * @example
 * ```typescript
 * @Get(':id')
 * async getUser(@Param('id') id: string, @Decrypt('email', { table: 'users', column: 'email' }) decryptedEmail: string) {
 *   // decryptedEmail is automatically decrypted
 *   return { id, email: decryptedEmail };
 * }
 *
 * @Get(':id')
 * async getUser(@Param('id') id: string, @DecryptModel('users') user: User) {
 *   // user is automatically decrypted based on schema
 *   return user;
 * }
 * ```
 */
export const Decrypt = createParamDecorator(
  async (field: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest()
    const protectService = getProtectService(ctx)

    if (!protectService) {
      throw new Error(
        'ProtectService not found. Make sure ProtectModule is imported.',
      )
    }

    const value =
      request.body?.[field] || request.params?.[field] || request.query?.[field]
    if (value === undefined || value === null) {
      return value
    }

    // Check if value is already an encrypted payload
    if (typeof value === 'object' && value.c) {
      const result = await protectService.decrypt(value)
      if (result.failure) {
        throw new Error(`Decryption failed: ${result.failure.message}`)
      }
      return result.data
    }

    // If it's not encrypted, return as-is
    return value
  },
)

/**
 * Decorator to automatically decrypt an entire model based on schema
 */
export const DecryptModel = createParamDecorator(
  async (tableName: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest()
    const protectService = getProtectService(ctx)

    if (!protectService) {
      throw new Error(
        'ProtectService not found. Make sure ProtectModule is imported.',
      )
    }

    const model = request.body || request.params || request.query
    if (!model || typeof model !== 'object') {
      return model
    }

    // This would need to be enhanced to work with actual schema definitions
    // For now, it's a placeholder for the concept
    return model
  },
)
