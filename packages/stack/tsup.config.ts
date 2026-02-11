import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      client: 'src/client.ts',
      'identify/index': 'src/identify/index.ts',
      'secrets/index': 'src/stash/index.ts',
    },
    format: ['cjs', 'esm'],
    sourcemap: true,
    dts: true,
    target: 'es2022',
    tsconfig: './tsconfig.json',
  },
  {
    entry: ['src/bin/stash.ts'],
    outDir: 'dist/bin',
    format: ['esm'],
    target: 'es2022',
    banner: {
      js: '#!/usr/bin/env node',
    },
    dts: false,
    sourcemap: true,
    external: ['dotenv'],
    noExternal: [],
  },
])
