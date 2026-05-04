import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { include: ['scripts/__tests__/**/*.test.mjs'], pool: 'forks' },
})
