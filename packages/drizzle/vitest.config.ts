import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@cipherstash/drizzle/pg': resolve(__dirname, 'src/pg/index.ts'),
    },
  },
})
