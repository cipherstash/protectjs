import 'dotenv/config'
import { defineContract, encrypted, Encryption } from '@cipherstash/stack'

const contract = defineContract({
  users: {
    name: encrypted({ type: 'string', equality: true, freeTextSearch: true }),
  },
})

export const client = await Encryption({
  contract,
})

const eName = await client.encrypt('John', {
  contract: contract.users.name,
})

if (eName.failure) {
  throw new Error(`[encryption]: ${eName.failure.message}`)
}

console.log(eName.data)
