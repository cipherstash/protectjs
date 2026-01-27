import 'dotenv/config'
import readline from 'node:readline'
import { protectClient, users } from './protect'
import { queryTypes } from '@cipherstash/protect'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

const askQuestion = (): Promise<string> => {
  return new Promise((resolve) => {
    rl.question('\n👋Hello\n\nWhat is your name? ', (answer) => {
      resolve(answer)
    })
  })
}

async function main() {
  const input = await askQuestion()

  const encryptResult = await protectClient.encrypt(input, {
    column: users.name,
    table: users,
  })

  if (encryptResult.failure) {
    throw new Error(`[protect]: ${encryptResult.failure.message}`)
  }

  const ciphertext = encryptResult.data

  console.log('Encrypting your name...')
  console.log('The ciphertext is:', ciphertext)

  const decryptResult = await protectClient.decrypt(ciphertext)

  if (decryptResult.failure) {
    throw new Error(`[protect]: ${decryptResult.failure.message}`)
  }

  const plaintext = decryptResult.data

  console.log('Decrypting the ciphertext...')
  console.log('The plaintext is:', plaintext)

  // Demonstrate bulk encryption
  console.log('\n--- Bulk Encryption Demo ---')

  const bulkPlaintexts = [
    { id: '1', plaintext: 'Alice' },
    { id: '2', plaintext: 'Bob' },
    { id: '3', plaintext: 'Charlie' },
    { id: '4', plaintext: null },
  ]

  console.log(
    'Bulk encrypting names:',
    bulkPlaintexts.map((p) => p.plaintext),
  )

  const bulkEncryptResult = await protectClient.bulkEncrypt(bulkPlaintexts, {
    column: users.name,
    table: users,
  })

  if (bulkEncryptResult.failure) {
    throw new Error(`[protect]: ${bulkEncryptResult.failure.message}`)
  }

  console.log('Bulk encrypted data:', bulkEncryptResult.data)

  const queryData = await protectClient.encryptQuery('test', {
    column: users.name,
    table: users,
    queryType: queryTypes.equality,
  })

  if (queryData.failure) {
    throw new Error(`[protect]: ${queryData.failure.message}`)
  }

  console.log('Query data:', queryData.data)

  const queryData1 = await protectClient.encryptQuery('test', {
    column: users.name,
    table: users,
    queryType: queryTypes.freeTextSearch,
  })

  if (queryData1.failure) {
    throw new Error(`[protect]: ${queryData1.failure.message}`)
  }

  console.log('Query data:', queryData1.data)

  const queryData2 = await protectClient.encryptQuery('test', {
    column: users.name,
    table: users,
    queryType: queryTypes.orderAndRange,
  })

  if (queryData2.failure) {
    throw new Error(`[protect]: ${queryData2.failure.message}`)
  }

  console.log('Query data:', queryData2.data)

  // const queryData3 = await protectClient.encryptQuery('test', {
  //   path: '$.name',
  //   column: users.data,
  //   table: users,
  // })

  // if (queryData3.failure) {
  //   throw new Error(`[protect]: ${queryData3.failure.message}`)
  // }

  // console.log('Query data:', queryData3.data)

  rl.close()
}

main()
