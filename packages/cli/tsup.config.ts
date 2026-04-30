import { cpSync } from 'node:fs'
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
    esbuildOptions(options) {
      // Suppress import.meta warning in CJS — we guard with typeof checks at runtime
      options.logOverride = {
        ...options.logOverride,
        'empty-import-meta': 'silent',
      }
    },
    onSuccess: async () => {
      // Copy bundled SQL files into dist so they ship with the package
      cpSync('src/sql', 'dist/sql', { recursive: true })
    },
  },
  {
    entry: ['src/bin/stash.ts'],
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

    skipNodeModulesBundle: true,
  },
])
