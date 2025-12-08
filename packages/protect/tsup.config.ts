import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts', 'src/identify/index.ts'],
  format: ['cjs', 'esm'],
  sourcemap: true,
  dts: true,
  target: 'es2022',
  tsconfig: './tsconfig.json',
})
