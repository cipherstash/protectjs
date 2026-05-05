import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    fileParallelism: false,
  },
  benchmark: {
    include: ['__benches__/**/*.bench.ts'],
    outputJson: 'results/bench-results.json',
  },
})
