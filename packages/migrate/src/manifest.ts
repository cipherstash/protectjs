import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'

const IndexKind = z.enum(['unique', 'match', 'ore', 'ste_vec'])

const ManifestColumnSchema = z.object({
  column: z.string(),
  castAs: z.string().default('text'),
  indexes: z.array(IndexKind).default([]),
  targetPhase: z
    .enum(['schema-added', 'dual-writing', 'backfilled', 'cut-over', 'dropped'])
    .default('cut-over'),
  pkColumn: z.string().optional(),
})

const ManifestSchema = z.object({
  version: z.literal(1).default(1),
  tables: z.record(z.array(ManifestColumnSchema)),
})

export type Manifest = z.infer<typeof ManifestSchema>
export type ManifestColumn = z.infer<typeof ManifestColumnSchema>

export function manifestPath(cwd: string = process.cwd()): string {
  return path.join(cwd, '.cipherstash', 'migrations.json')
}

export async function readManifest(
  cwd: string = process.cwd(),
): Promise<Manifest | null> {
  const filePath = manifestPath(cwd)
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  const parsed = ManifestSchema.parse(JSON.parse(raw))
  return parsed
}

export async function writeManifest(
  manifest: Manifest,
  cwd: string = process.cwd(),
): Promise<void> {
  const filePath = manifestPath(cwd)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const validated = ManifestSchema.parse(manifest)
  await fs.writeFile(
    filePath,
    `${JSON.stringify(validated, null, 2)}\n`,
    'utf-8',
  )
}
