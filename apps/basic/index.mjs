import 'dotenv/config'
import { protect } from '@cipherstash/protect'

async function main() {
  const protectClient = await protect()

  const ciphertext = await protectClient.encrypt('plaintext', {
    column: 'column_name',
    table: 'users',
  })

  const plaintext = await protectClient.decrypt(ciphertext)

  console.log('The plaintext is:', plaintext)
}

main()
