import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.ts',
  dbCredentials: {
    host: '127.0.0.1',
    port: 3306,
    user: 'encryption_example',
    password: 'password',
    database: 'encryption_example',
  },
})

// mysql://encryption_example:password@127.0.0.1:3306/encryption_example
