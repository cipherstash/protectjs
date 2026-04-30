import { defineConfig } from 'vitest/config'

// E2E tests spawn child processes (built binaries) and may hit the network.
// Use the forks pool so each test gets a clean process; longer timeouts to
// accommodate subprocess startup + I/O.
export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.e2e.test.ts'],
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
