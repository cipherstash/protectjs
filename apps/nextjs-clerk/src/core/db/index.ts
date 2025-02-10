import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

if (!process.env.POSTGRES_URL) {
  throw new Error(
    "[ Server ]  Error: Drizzle ORM - You did not supply 'POSTGRES_URL' env var.",
  )
}

const connectionString = process.env.POSTGRES_URL
const client = postgres(connectionString)
export const db = drizzle(client)
