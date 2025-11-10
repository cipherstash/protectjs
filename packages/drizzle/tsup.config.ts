import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/pg/index.ts'],
    outDir: 'dist/pg',
    format: ['cjs', 'esm'],
    sourcemap: true,
    dts: true,
  },
  {
    entry: ['src/bin/generate-eql-migration.ts'],
    outDir: 'dist/bin',
    format: ['cjs', 'esm'],
    target: 'esnext',
    clean: true,
    splitting: true,
    minify: true,
    shims: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
])
