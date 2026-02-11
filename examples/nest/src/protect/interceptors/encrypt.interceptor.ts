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

export interface EncryptInterceptorOptions {
  fields?: string[]
  table: EncryptedTable<EncryptedTableColumn>
  column: ProtectColumn | EncryptedValue
  lockContext?: unknown
}

/**
 * Interceptor to automatically encrypt response data
 *
 * @example
 * ```typescript
 * @UseInterceptors(new EncryptInterceptor({
 *   fields: ['email', 'phone'],
 *   table: 'users',
 *   column: 'email'
 * }))
 * @Get()
 * async getUsers() {
 *   return this.userService.findAll(); // Email and phone fields will be encrypted
 * }
 * ```
 */
@Injectable()
export class EncryptInterceptor implements NestInterceptor {
  constructor(private readonly options: EncryptInterceptorOptions) {}

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
            data.map((item) => this.encryptItem(item, protectService)),
          )
        }

        return this.encryptItem(data, protectService)
      }),
    )
  }

  private async encryptItem(
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
          const encryptResult = await protectService.encrypt(result[field], {
            table: this.options.table,
            column: this.options.column,
          })

          if (encryptResult.failure) {
            throw new Error(
              `Encryption failed for field ${field}: ${encryptResult.failure.message}`,
            )
          }

          result[field] = encryptResult.data
        }
      }
    }

    return result
  }
}
