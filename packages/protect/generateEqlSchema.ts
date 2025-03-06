import fs from 'node:fs/promises'
import { execa } from 'execa'

async function main() {
  const url =
    'https://raw.githubusercontent.com/cipherstash/encrypt-query-language/main/sql/schemas/cs_encrypted_storage_v1.schema.json'

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch schema, status = ${response.status}`)
  }

  const data = await response.json()

  await fs.writeFile('./eql.schema.json', JSON.stringify(data, null, 2))

  await execa('pnpm', ['run', 'eql:generate'], { stdio: 'inherit' })

  console.log(
    'The EQL schema has been updated from the source repo and the types have been generated. See the `eql.schema.json` file for the latest schema.',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
