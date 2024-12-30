# CipherStash JSEQL + Supabase + Hono Example

This project demonstrates how to encrypt data using [@cipherstash/jseql](https://www.npmjs.com/package/@cipherstash/jseql) before storing it in a [Supabase](https://supabase.com/) Postgres database. It uses [Hono](https://hono.dev/) to create a minimal RESTful API, showcasing how to seamlessly integrate field-level encryption into a typical web application workflow.

## Table of Contents
- [Overview](#overview)  
- [Prerequisites](#prerequisites)  
- [Getting Started](#getting-started)
  - [1. Clone the repository](#1-clone-the-repository)
  - [2. Install dependencies](#2-install-dependencies)
  - [3. Set up environment variables](#3-set-up-environment-variables)
  - [4. Create the `users` table in Supabase](#4-create-the-users-table-in-supabase)
  - [5. Run the application](#5-run-the-application)
- [API Endpoints](#api-endpoints)
  - [GET /users](#get-users)
  - [POST /users](#post-users)
- [Explanation of the Code](#explanation-of-the-code)
- [Additional Resources](#additional-resources)
- [License](#license)

---

## Overview

**What does this example show?**  
1. **Encrypting data** with [@cipherstash/jseql](https://www.npmjs.com/package/@cipherstash/jseql).  
2. **Storing encrypted data** in a Postgres database (using Supabase).  
3. **Retrieving and decrypting** that data in a minimal Hono-based REST API.  

**Why is this useful?**  
- You get strong, field-level encryption on sensitive data (like user emails) before it even hits your database.  
- You can keep your API and database interactions almost the same, with only minor changes to handle encryption/decryption.

---

## Prerequisites

1. **Node.js** v18+ or v20+
2. **Supabase account**
3. A **CipherStash account** (to acquire the required JSEQL credentials)  
4. A `.env` file with the following environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `CS_CLIENT_ID`
   - `CS_CLIENT_KEY`
   - `CS_CLIENT_ACCESS_KEY`
   - `CS_WORKSPACE_ID`

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/cipherstash/jseql.git
cd jseql/apps/hono-supabase
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env` file in the root directory (if not already present) and fill in your keys and IDs:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key

CS_CLIENT_ID=your-cs-client-id
CS_CLIENT_KEY=your-cs-client-key
CS_CLIENT_ACCESS_KEY=your-cs-client-access-key
CS_WORKSPACE_ID=your-cs-workspace-id
```

> **Note**: Keep these values **secret**. Never commit them to a public repo.

### 4. Create the `users` table in Supabase

In your Supabase project, create the following table:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email jsonb NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(255) NOT NULL
);
```

- The `email` field is of type `jsonb` to accommodate the encrypted data structure.

### 5. Run the application

```bash
npm run dev
```

This will start the server at [http://localhost:3000](http://localhost:3000).

---

## API Endpoints

### GET /users
Retrieves a list of all users from the `users` table.  
- **Endpoint**: `GET http://localhost:3000/users`  
- **Response**: Returns an array of users with their `email` fields **decrypted**.

#### Example Response

```json
{
  "users": [
    {
      "id": 1,
      "email": "alice@example.com",
      "name": "Alice",
      "role": "admin"
    },
    {
      "id": 2,
      "email": "bob@example.com",
      "name": "Bob",
      "role": "admin"
    }
  ]
}
```

### POST /users
Creates a new user with an **encrypted** email field.  
- **Endpoint**: `POST http://localhost:3000/users`
- **Request Body**: 
  ```json
  {
    "email": "alice@example.com",
    "name": "Alice"
  }
  ```
- **Response**: 
  ```json
  {
    "message": "User created successfully"
  }
  ```
  
  If the creation fails, you’ll get:
  ```json
  {
    "message": "User creation failed. Please check the logs"
  }
  ```

---

## Explanation of the Code

```js
import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createClient } from '@supabase/supabase-js'
import { Hono } from 'hono'
import { createRequire } from 'node:module'

// We use ES6 require for @cipherstash/jseql due to dynamic import limitations
const require = createRequire(import.meta.url)
const { eql } = require('@cipherstash/jseql')

// 1. Initialize the CipherStash EQL client using environment variables
const eqlClient = await eql()

// 2. Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseKey)

// 3. Create your Hono application
const app = new Hono()

// 4. GET /users
//    - Pulls records from the `users` table
//    - Decrypts the `email` field
app.get('/users', async (c) => {
  const { data: users } = await supabase.from('users').select()
  if (users && users.length > 0) {
    const decryptedusers = await Promise.all(
      users.map(async (user) => {
        const plaintextEmail = await eqlClient.decrypt(user.email)
        return { ...user, email: plaintextEmail }
      })
    )
    return c.json({ users: decryptedusers })
  }
  return c.json({ users: [] })
})

// 5. POST /users
//    - Encrypts the `email` field using jseql
//    - Inserts the encrypted data into the `users` table
app.post('/users', async (c) => {
  const { email, name } = await c.req.json()
  if (!email || !name) {
    return c.json({ message: 'Email and name are required to create a user' }, 400)
  }

  // Encrypt the email
  const encryptedEmail = await eqlClient.encrypt(email, {
    column: 'email',
    table: 'users',
  })

  // Insert the encrypted data
  const result = await supabase
    .from('users')
    .insert({ email: encryptedEmail, name, role: 'admin' })

  if (result.statusText === 'Created') {
    return c.json({ message: 'User created successfully' })
  }

  // Log and return an error message if the insertion fails
  console.error('User creation failed:', result)
  return c.json({ message: 'User creation failed. Please check the logs' }, 500)
})

// 6. Start the server on port 3000
serve({
  fetch: app.fetch,
  port: 3000,
})
```

**Key points to note:**
- `@cipherstash/jseql` provides two primary functions: `encrypt()` and `decrypt()`.
- The encrypted field is stored as JSON in the format `{ c: "ciphertext" }`.
- `@hono/node-server` is used to run the Hono application as a Node.js server.
- `dotenv/config` automatically loads environment variables from your `.env` file.
- We leverage Supabase’s client (`@supabase/supabase-js`) to insert and select data.

---

## Additional Resources

- [CipherStash JSEQL Documentation](https://github.com/cipherstash/jseql)
- [Hono Framework](https://hono.dev/)
- [Supabase Documentation](https://supabase.com/docs)