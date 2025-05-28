'use server'

import { users } from '@/core/db/schema'
import { db } from '@/core/db'
import { protectClient, users as protectUsers } from '@/core/protect'
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
  const encryptedResult = await protectClient
    .encrypt(email, {
      column: protectUsers.email,
      table: protectUsers,
    })
    .withLockContext(lockContext)

  if (encryptedResult.failure) {
    return {
      error: 'Failed to add the user. There was an error encrypting the email.',
    }
  }

  const encryptedEmail = encryptedResult.data

  try {
    await db.insert(users).values({ name, email: encryptedEmail, role })
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to add user:', error)
    return { error: 'Failed to add user' }
  }
}
