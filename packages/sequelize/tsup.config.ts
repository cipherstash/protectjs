import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  sourcemap: true,
  dts: true,
  clean: true,
  tsconfig: './tsconfig.build.json',
})
