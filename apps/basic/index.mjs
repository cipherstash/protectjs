import 'dotenv/config'
import { protect } from '@cipherstash/protect'
import readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = () => {
  return new Promise((resolve) => {
    rl.question("\n👋Hello\n\nWhat is your name? ", (answer) => {
      resolve(answer);
    });
  });
};

async function main() {
  const protectClient = await protect()
  const input = await askQuestion();

  const ciphertext = await protectClient.encrypt(input, {
    column: 'column_name',
    table: 'users',
  })

  console.log('Encrypting your name...')
  console.log('The ciphertext is:', ciphertext)

  const plaintext = await protectClient.decrypt(ciphertext)

  console.log('Decrypting the ciphertext...')
  console.log('The plaintext is:', plaintext)

  rl.close();
}

main()
