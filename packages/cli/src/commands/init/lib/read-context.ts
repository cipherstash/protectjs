import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CONTEXT_REL_PATH, type ContextFile } from './write-context.js'

/**
 * Read the `.cipherstash/context.json` file written by `stash init`.
 * Returns `undefined` when the file is missing or malformed — both `stash
 * plan` and `stash impl` use that signal to point the user back at
 * `stash init` rather than crashing.
 *
 * Never throws on bad input. Malformed JSON is treated as "no context."
 */
export function readContextFile(cwd: string): ContextFile | undefined {
  const path = resolve(cwd, CONTEXT_REL_PATH)
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ContextFile
  } catch {
    return undefined
  }
}
