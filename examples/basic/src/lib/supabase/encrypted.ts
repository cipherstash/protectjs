import { encryptedSupabase } from '@cipherstash/stack/supabase'
import { encryptionClient, contactsTable } from '../../encryption/index'
import { createServerClient } from './server'

const supabase = await createServerClient()
export const eSupabase = encryptedSupabase({
  encryptionClient,
  supabaseClient: supabase,
})