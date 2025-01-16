import 'dotenv/config'
import { eql } from '@cipherstash/jseql'

async function main() {
  const eqlClient = await eql()

  const ciphertext = await eqlClient.encrypt('plaintext', {
    column: 'column_name',
    table: 'users',
  })

  const plaintext = await eqlClient.decrypt(ciphertext)

  console.log('The plaintext is:', plaintext)
}

main()
