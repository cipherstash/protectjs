#!/usr/bin/env node

import fs from 'node:fs/promises'
import { execa } from 'execa'

async function main() {
  const url =
    'https://raw.githubusercontent.com/cipherstash/encrypt-query-language/main/sql/schemas/cs_plaintext_v1.schema.json'

  const response = await fetch(url)
  const data = await response.json()

  await fs.writeFile(
    './cs_plaintext_v1.schema.json',
    JSON.stringify(data, null, 2),
  )

  await execa('pnpm', ['run', 'generate-types'], { stdio: 'inherit' })

  console.log('Types generated!')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
