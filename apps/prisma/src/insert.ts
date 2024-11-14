import { getEmailArg } from '@cipherstash/utils'
import { createEqlPayload } from '@cipherstash/jseql'
import { prisma } from './db'

const email = getEmailArg({
  required: true,
})

await prisma.user.create({
  data: {
    email: email ?? 'test@test.com',
    email_encrypted: createEqlPayload({
      plaintext: email,
      table: 'users',
      column: 'email_encrypted',
    }),
  },
})

console.log(
  "[INFO] You've inserted a new user with an encrypted email from the plaintext",
  email,
)

await prisma.$disconnect()
process.exit(0)
