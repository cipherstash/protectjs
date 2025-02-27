import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createClient } from '@supabase/supabase-js'
import { Hono } from 'hono'
import { protect } from '@cipherstash/protect'

// Initialize the EQL client
// Make sure you have the following environment variables defined in your .env file:
// CS_CLIENT_ID, CS_CLIENT_KEY, CS_CLIENT_ACCESS_KEY, CS_WORKSPACE_ID
const protectClient = await protect()

// Create a single supabase client for interacting with the database
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

// This example expects the following table in your Supabase database.
// The email field is the only field that will be encrypted and the required column type is jsonb.
// ---
// CREATE TABLE users (
//   id SERIAL PRIMARY KEY,
//   email jsonb NOT NULL,
//   name VARCHAR(255) NOT NULL,
//   role VARCHAR(255) NOT NULL
// );
export const supabase = createClient(supabaseUrl, supabaseKey)

const app = new Hono()

app.get('/users', async (c) => {
  const { data: users } = await supabase.from('users').select()

  if (users && users.length > 1) {
    const decryptedusers = await Promise.all(
      users.map(async (user) => {
        // The encrypted data is stored in the EQL format: { c: 'ciphertext' }
        // and the decrypt function expects the data to be in this format.
        const decryptResult = await protectClient.decrypt(user.email)

        if (decryptResult.failure) {
          console.error(
            'Failed to decrypt the email for user',
            user.id,
            decryptResult.failure.message,
          )

          return user
        }

        const plaintext = decryptResult.data
        return { ...user, email: plaintext }
      }),
    )

    return c.json({ users: decryptedusers })
  }

  return c.json({ users: [] })
})

app.post('/users', async (c) => {
  const { email, name } = await c.req.json()

  if (!email || !name) {
    return c.json(
      { message: 'Email and name are required to create a users' },
      400,
    )
  }

  // The encrypt function expects the plaintext to be of type string
  // and the second argument to be an object with the table and column
  // names of the table where you are storing the data.
  const encryptedResult = await protectClient.encrypt(email, {
    column: 'email',
    table: 'users',
  })

  if (encryptedResult.failure) {
    console.error(
      'Failed to encrypt the email',
      encryptedResult.failure.message,
    )
    return c.json({ message: 'Failed to encrypt the email' }, 500)
  }

  const encryptedEmail = encryptedResult.data

  // The encrypt function will return an object with a c key, which is the encrypted data.
  // We are logging the encrypted data to the console for demonstration purposes.
  console.log(
    'Encrypted email that will be stored in the database:',
    encryptedEmail,
  )

  const result = await supabase
    .from('users')
    .insert({ email: encryptedEmail, name, role: 'admin' })

  if (result.statusText === 'Created') {
    return c.json({ message: 'User created successfully' })
  }

  console.error('User creation failed:', result)
  return c.json({ message: 'User creation failed. Please check the logs' }, 500)
})

const port = 3000
console.log(`Server is running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port,
})
