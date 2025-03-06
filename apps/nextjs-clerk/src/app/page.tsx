import Header from '../components/Header'
import UserTable from '../components/UserTable'
import { users } from '@/core/db/schema'
import { db } from '@/core/db'
import { protectClient, getLockContext } from '@/core/protect'
import { auth, currentUser } from '@clerk/nextjs/server'
import { getCtsToken } from '@cipherstash/nextjs'
import type { EncryptedData } from '@cipherstash/protect'

export type EncryptedUser = {
  id: number
  name: string
  email: string | null
  authorized: boolean
  role: string
}

async function getUsers(): Promise<EncryptedUser[]> {
  const { userId } = await auth()
  const token = await getCtsToken()
  const results = await db.select().from(users).limit(500)

  if (userId && token.success) {
    const cts_token = token.ctsToken
    const lockContext = getLockContext(cts_token)

    const promises = results.map(async (row) => {
      const decryptResult = await protectClient
        .decrypt(row.email as EncryptedData)
        .withLockContext(lockContext)

      if (decryptResult.failure) {
        console.error(
          'Failed to decrypt the email for user',
          row.id,
          decryptResult.failure.message,
        )

        return row.email
      }

      return decryptResult.data
    })

    const data = (await Promise.allSettled(promises)) as PromiseSettledResult<
      string | null
    >[]

    return results.map((row, index) => ({
      ...row,
      authorized: data[index].status === 'fulfilled',
      email:
        data[index].status === 'fulfilled'
          ? data[index].value
          : (row.email as { c: string }).c,
    }))
  }

  return results.map((row) => ({
    id: row.id,
    name: row.name,
    authorized: false,
    email: (row.email as { c: string })?.c,
    role: row.role,
  }))
}

export default async function Home() {
  const users = await getUsers()
  const user = await currentUser()

  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-grow px-6 py-8">
        <div className="flex items-center align-center gap-6 mb-6">
          <h2 className="text-2xl font-bold">Users</h2>
          <span className="text-xs text-gray-500 max-w-[450px]">
            The email address of each user was encrypted with CipherStash and{' '}
            <b>locked</b> to the individual who created the user. Only that
            individual will be able to decrypt the email.
          </span>
        </div>
        <UserTable
          users={users}
          email={user?.primaryEmailAddress?.emailAddress}
        />
      </div>
    </main>
  )
}
