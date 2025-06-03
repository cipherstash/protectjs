import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.ts',
  dbCredentials: {
    host: '127.0.0.1',
    port: 3306,
    user: 'protect_example',
    password: 'password',
    database: 'protect_example',
  },
})

// mysql://protect_example:password@127.0.0.1:3306/protect_example
