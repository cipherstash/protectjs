import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import type { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import type { ProtectService } from '../protect.service'
import { getProtectService } from '../utils/get-protect-service.util'

import type {
  EncryptedTable,
  EncryptedTableColumn,
  EncryptedValue,
  ProtectColumn,
} from '@cipherstash/stack'

export interface DecryptInterceptorOptions {
  fields?: string[]
  table: EncryptedTable<EncryptedTableColumn>
  column: ProtectColumn | EncryptedValue
  lockContext?: unknown
}

/**
 * Interceptor to automatically decrypt response data
 *
 * @example
 * ```typescript
 * @UseInterceptors(new DecryptInterceptor({
 *   fields: ['email', 'phone'],
 *   table: 'users',
 *   column: 'email'
 * }))
 * @Get()
 * async getUsers() {
 *   return this.userService.findAll(); // Email and phone fields will be decrypted
 * }
 * ```
 */
@Injectable()
export class DecryptInterceptor implements NestInterceptor {
  constructor(private readonly options: DecryptInterceptorOptions) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const protectService = getProtectService(context)

    if (!protectService) {
      throw new Error(
        'ProtectService not found. Make sure ProtectModule is imported.',
      )
    }

    return next.handle().pipe(
      map(async (data: unknown) => {
        if (!data) return data

        if (Array.isArray(data)) {
          return Promise.all(
            data.map((item) => this.decryptItem(item, protectService)),
          )
        }

        return this.decryptItem(data, protectService)
      }),
    )
  }

  private async decryptItem(
    item: unknown,
    protectService: ProtectService,
  ): Promise<unknown> {
    if (!item || typeof item !== 'object') {
      return item
    }

    const result = { ...item }

    if (this.options.fields) {
      for (const field of this.options.fields) {
        if (result[field] !== undefined && result[field] !== null) {
          // Check if the field contains an encrypted payload
          if (typeof result[field] === 'object' && result[field].c) {
            const decryptResult = await protectService.decrypt(result[field])

            if (decryptResult.failure) {
              throw new Error(
                `Decryption failed for field ${field}: ${decryptResult.failure.message}`,
              )
            }

            result[field] = decryptResult.data
          }
        }
      }
    }

    return result
  }
}
