import { getPlaintext } from '../../../packages/eql/dist'
import { prisma } from './db'
import { getEmailArg } from '@cipherstash/utils'
import type { User } from '@prisma/client'

const email = getEmailArg({
  required: false,
})

let users: User[]

if (email) {
  // TODO: Fix dynamic type of the whereEncrypted method
  users = (await prisma.user.whereEncrypted(
    'email_encrypted',
    email,
  )) as unknown as User[]
} else {
  users = await prisma.user.findMany()
}

console.log('[INFO] All emails have been decrypted by CipherStash Proxy')
console.log(
  'Emails:',
  JSON.stringify(
    users.map((row) => getPlaintext(row.email_encrypted)),
    null,
    2,
  ),
)

await prisma.$disconnect()
process.exit(0)
