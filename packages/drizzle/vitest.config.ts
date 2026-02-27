import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@cipherstash/drizzle/pg': fileURLToPath(
        new URL('./src/pg/index.ts', import.meta.url),
      ),
    },
  },
})
