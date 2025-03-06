import 'dotenv/config'
import { protectClient, users } from './protect'
import readline from 'node:readline'

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

  rl.close()
}

main()
