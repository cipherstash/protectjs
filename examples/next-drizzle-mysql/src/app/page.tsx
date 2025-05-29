import { db } from '@/db'
import { users } from '@/db/schema'
import { users as protectedUsers } from '@/protect/schema'
import { ClientForm } from '@/components/form'
import { protectClient } from '@/protect'

type User = {
  id: number
  name: string
  email: string
}

export default async function Home() {
  const u = await db.select().from(users).limit(10)

  const decryptedUsers = await protectClient.bulkDecryptModels(u)

  if (decryptedUsers.failure) {
    throw new Error(decryptedUsers.failure.message)
  }

  return (
    <div className="max-w-2xl mx-auto pt-6">
      <ClientForm />
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">ID</th>
            <th className="text-left py-2">Name</th>
            <th className="text-left py-2">Email</th>
          </tr>
        </thead>
        <tbody>
          {decryptedUsers.data.map((user) => (
            <tr key={user.id} className="border-b">
              <td className="py-2">{user.id}</td>
              <td className="py-2">{user.name as string}</td>
              <td className="py-2">{user.email as string}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
