import type { ContractTableRef } from '@/contract'
import { EncryptedQueryBuilderImpl } from './query-builder'
import type {
  EncryptedSupabaseConfig,
  EncryptedSupabaseInstance,
} from './types'

/**
 * Create an encrypted Supabase wrapper that transparently handles encryption
 * and decryption for queries on encrypted columns.
 *
 * @param config - Configuration containing the encryption client and Supabase client.
 * @returns An object with a `from()` method that mirrors `supabase.from()` but
 *   auto-encrypts mutations, adds `::jsonb` casts, encrypts filter values, and
 *   decrypts results.
 *
 * @example
 * ```typescript
 * import { Encryption, defineContract } from '@cipherstash/stack'
 * import { encryptedSupabase } from '@cipherstash/stack/supabase'
 *
 * const contract = defineContract({
 *   users: {
 *     name: { type: 'string', freeTextSearch: true, equality: true },
 *     email: { type: 'string', freeTextSearch: true, equality: true },
 *   },
 * })
 *
 * const client = await Encryption({ contract })
 * const eSupabase = encryptedSupabase({ encryptionClient: client, supabaseClient: supabase })
 *
 * // INSERT - auto-encrypts, auto-converts to PG composite
 * await eSupabase.from('users', contract.users)
 *   .insert({ name: 'John', email: 'john@example.com', age: 30 })
 *
 * // SELECT with filter - auto-casts ::jsonb, auto-encrypts search term, auto-decrypts
 * const { data } = await eSupabase.from('users', contract.users)
 *   .select('id, email, name')
 *   .eq('email', 'john@example.com')
 * ```
 */
export function encryptedSupabase(
  config: EncryptedSupabaseConfig,
): EncryptedSupabaseInstance {
  const { encryptionClient, supabaseClient } = config

  return {
    from<T extends Record<string, unknown> = Record<string, unknown>>(
      tableName: string,
      tableRef: ContractTableRef,
    ) {
      return new EncryptedQueryBuilderImpl<T>(
        tableName,
        tableRef._table,
        encryptionClient,
        supabaseClient,
      )
    },
  }
}

export type {
  EncryptedSupabaseConfig,
  EncryptedSupabaseInstance,
  EncryptedSupabaseResponse,
  EncryptedSupabaseError,
  EncryptedQueryBuilder,
  PendingOrCondition,
  SupabaseClientLike,
} from './types'
