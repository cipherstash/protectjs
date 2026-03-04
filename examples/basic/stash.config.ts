import { defineConfig } from '@cipherstash/stack-forge'

export default defineConfig({
  databaseUrl: process.env.DATABASE_URL!,
})
