import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  // dialect: 'postgresql',
  dialect: 'mysql',
  dbCredentials: {
    // url: process.env.DATABASE_URL!,
    host: 'localhost',
    port: 3306,
    password: 'mypassword',
    user: 'myuser',
    database: 'drizzle_example',
  },
})
