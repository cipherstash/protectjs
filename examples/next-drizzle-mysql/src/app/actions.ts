'use server'

import type { FormData } from '@/components/form'
import { db } from '@/db'
import { users } from '@/db/schema'
import { encryptionClient } from '@/encryption'
import { users as encryptedUsers } from '@/encryption/schema'

export async function createUser(data: FormData) {
  console.log(data)

  const result = await encryptionClient.encryptModel(data, encryptedUsers)

  if (result.failure) {
    console.error(result.failure.message)
    return
  }

  console.log(result.data)

  await db.insert(users).values({
    name: result.data.name,
    email: result.data.email,
  })

  return {
    success: true,
  }
}
