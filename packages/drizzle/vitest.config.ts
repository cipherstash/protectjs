import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@cipherstash/drizzle/pg': fileURLToPath(new URL('./src/pg/index.ts', import.meta.url)),
    },
  },
})
