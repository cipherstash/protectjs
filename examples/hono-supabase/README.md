# CipherStash JSEQL + Supabase + Hono Example

This project demonstrates how to encrypt data using [@cipherstash/protect](https://www.npmjs.com/package/@cipherstash/protect) before storing it in a [Supabase](https://supabase.com/) Postgres database. It uses [Hono](https://hono.dev/) to create a minimal RESTful API, showcasing how to seamlessly integrate field-level encryption into a typical web application workflow.

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
- [Additional Resources](#additional-resources)
- [License](#license)

---

## Overview

**What does this example show?**  
1. **Encrypting data** with [@cipherstash/protect](https://www.npmjs.com/package/@cipherstash/protect).  
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
git clone https://github.com/cipherstash/jsprotect.git
cd jsprotect/examples/hono-supabase
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

## Additional Resources

- [@cipherstash/protect Documentation](https://github.com/cipherstash/protectjs)
- [Hono Framework](https://hono.dev/)
- [Supabase Documentation](https://supabase.com/docs)