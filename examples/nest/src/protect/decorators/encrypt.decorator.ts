import { type ExecutionContext, createParamDecorator } from '@nestjs/common'
import type { ProtectService } from '../protect.service'
import { users } from '../schema'
import { getProtectService } from '../utils/get-protect-service.util'

import type {
  EncryptedTable,
  EncryptedTableColumn,
  EncryptedValue,
  ProtectColumn,
} from '@cipherstash/stack'

export interface EncryptOptions {
  table: EncryptedTable<EncryptedTableColumn>
  column: ProtectColumn | EncryptedValue
  lockContext?: unknown // JWT or LockContext
}

/**
 * Decorator to automatically encrypt a field or entire object
 *
 * @example
 * ```typescript
 * @Post()
 * async createUser(@Body() userData: CreateUserDto, @Encrypt('email', { table: 'users', column: 'email' }) encryptedEmail: string) {
 *   // encryptedEmail is automatically encrypted
 *   return this.userService.create({ ...userData, email: encryptedEmail });
 * }
 *
 * @Post()
 * async createUser(@Body() @EncryptModel('users') userData: CreateUserDto) {
 *   // userData is automatically encrypted based on schema
 *   return this.userService.create(userData);
 * }
 * ```
 */
export const Encrypt = createParamDecorator(
  async (field: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest()
    const protectService = getProtectService(ctx)

    if (!protectService) {
      throw new Error(
        'ProtectService not found. Make sure ProtectModule is imported.',
      )
    }

    const value = request.body?.[field]
    if (value === undefined || value === null) {
      return value
    }

    // Note: This is a simplified example. In practice, you'd need to pass actual table/column objects
    // from your schema definitions rather than creating them inline
    const result = await protectService.encrypt(value, {
      table: users,
      column: users.email_encrypted,
    })

    if (result.failure) {
      throw new Error(`Encryption failed: ${result.failure.message}`)
    }

    return result.data
  },
)

/**
 * Decorator to automatically encrypt an entire model based on schema
 */
export const EncryptModel = createParamDecorator(
  async (tableName: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest()
    const protectService = getProtectService(ctx)

    if (!protectService) {
      throw new Error(
        'ProtectService not found. Make sure ProtectModule is imported.',
      )
    }

    const model = request.body
    if (!model || typeof model !== 'object') {
      return model
    }

    // This would need to be enhanced to work with actual schema definitions
    // For now, it's a placeholder for the concept
    return model
  },
)
