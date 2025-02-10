'use server'

import { users } from '@/core/db/schema'
import { db } from '@/core/db'
import { protectClient } from '@/core/protect'
import { getLockContext } from '@/core/protect'
import { getCtsToken } from '@cipherstash/nextjs'
import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'

export async function addUser(formData: FormData) {
  const { userId } = await auth()

  if (!userId) {
    return { error: 'You must be signed in to add a user.' }
  }

  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const role = formData.get('role') as string

  if (!name || !email || !role) {
    return { error: 'All fields are required' }
  }

  const ctsToken = await getCtsToken()

  if (!ctsToken.success) {
    return { error: 'There was an error getting your session token.' }
  }

  const lockContext = getLockContext(ctsToken.ctsToken)
  const encryptedEmail = await protectClient
    .encrypt(email, {
      column: users.email.name,
      table: 'users',
    })
    .withLockContext(lockContext)

  try {
    await db.insert(users).values({ name, email: encryptedEmail, role })
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to add user:', error)
    return { error: 'Failed to add user' }
  }
}
