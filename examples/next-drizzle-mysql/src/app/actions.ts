'use server'

import { db } from '@/db'
import { users } from '@/db/schema'
import type { FormData } from '@/components/form'
import { protectClient } from '@/protect'
import { users as protectedUsers } from '@/protect/schema'

export async function createUser(data: FormData) {
  console.log(data)

  const result = await protectClient.encryptModel(data, protectedUsers)

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
