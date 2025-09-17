import { Column } from 'typeorm'
import {
  createEncryptedColumnOptions,
  type EncryptedColumnOptions,
} from '../utils/encrypted-column'

/**
 * Decorator for encrypted columns that automatically handles PostgreSQL composite literal transformation
 *
 * @example
 * ```typescript
 * @Entity()
 * export class User {
 *   @EncryptedColumn()
 *   email: EncryptedData | null
 *
 *   @EncryptedColumn({ nullable: false })
 *   ssn: EncryptedData
 * }
 * ```
 */
export function EncryptedColumn(options: EncryptedColumnOptions = {}) {
  return Column(createEncryptedColumnOptions(options))
}
