import 'dotenv/config'

// NPM isn't working with Turborepo so hardcoded to cjs build for now
import { eql } from '../../packages/jseql/dist/index.cjs'

async function main() {
  if (!process.env.CS_CLIENT_ID || !process.env.CS_CLIENT_KEY) {
    throw new Error('CS_CLIENT_ID and CS_CLIENT_KEY must be set')
  }

  const eqlClient = await eql({
    workspaceId: 'test',
    clientId: process.env.CS_CLIENT_ID,
    clientKey: process.env.CS_CLIENT_KEY,
  })

  const ciphertext = await eqlClient.encrypt({
    plaintext: 'plaintext',
    column: 'column_name',
    table: 'users',
  })

  const plaintext = await eqlClient.decrypt(ciphertext)

  console.log('The plaintext is:', plaintext)
}

main()
