import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Integration } from '../commands/init/types.js'

/**
 * Get the directory of the current file, supporting both ESM and CJS.
 *
 * `fileURLToPath` is the right way to convert `import.meta.url` into a real
 * path — `new URL(...).pathname` gives `/C:/...` on Windows and percent-
 * encodes spaces, both of which break `existsSync` lookups.
 */
function currentDir(): string {
  if (typeof import.meta?.url === 'string' && import.meta.url) {
    return dirname(fileURLToPath(import.meta.url))
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — __dirname is the CJS fallback
  return __dirname
}

/**
 * Resolve the directory holding the bundled rulebook partials.
 *
 * Layouts to support:
 *   - Source (vitest, dev):   src/rulebook/partials.ts → src/rulebook/partials/
 *   - Library bundle (ESM):   dist/index.js            → dist/rulebook/partials/
 *   - Library bundle (CJS):   dist/index.cjs           → dist/rulebook/partials/
 *
 * tsup flattens the bundle entry to `dist/index.{js,cjs}`, so from the
 * library entrypoint the partials live at `./rulebook/partials/`. From source
 * they live at `./partials/`. Try both, pick the first that exists.
 */
function partialsDir(): string {
  const here = currentDir()
  const candidates = [
    resolve(here, 'partials'),
    resolve(here, 'rulebook', 'partials'),
    resolve(here, '..', 'rulebook', 'partials'),
  ]
  for (const dir of candidates) {
    if (existsSync(dir)) return dir
  }
  // Last-ditch: return the source-layout candidate so the readFileSync error
  // names a path the developer can act on. The literal index 0 is always set;
  // we keep the fallback narrow rather than throwing here because the actual
  // file read below will produce a clearer error than a generic throw.
  return candidates[0] ?? resolve(here, 'partials')
}

export function loadCorePartial(): string {
  return readFileSync(resolve(partialsDir(), 'core.md'), 'utf-8')
}

export function loadIntegrationPartial(integration: Integration): string {
  const path = resolve(partialsDir(), 'integrations', `${integration}.md`)
  return readFileSync(path, 'utf-8')
}
