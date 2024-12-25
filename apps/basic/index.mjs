import 'dotenv/config'

// NPM isn't working with Turborepo so hardcoded to cjs build for now
// import { eql } from '@cipherstash/jseql'
import { eql } from '../../packages/jseql/dist/index.cjs'

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
