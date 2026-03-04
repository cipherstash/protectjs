import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    sourcemap: true,
    dts: true,
    clean: true,
    target: 'es2022',
    tsconfig: './tsconfig.json',
    external: ['pg'],
  },
  {
    entry: ['src/bin/stash-forge.ts'],
    outDir: 'dist/bin',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    banner: {
      js: `#!/usr/bin/env node
import { createRequire as __createRequire } from 'module';
var require = __createRequire(import.meta.url);`,
    },
    dts: false,
    sourcemap: true,
    external: [],
    noExternal: ['dotenv', '@clack/prompts'],
  },
])
