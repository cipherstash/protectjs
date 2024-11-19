#!/usr/bin/env bun

// Fetch the latest schemas from https://github.com/cipherstash/encrypt-query-language/tree/main/sql/schemas
// Write file to ./cs_encrypted_v1.schema.json
import { $ } from 'bun'

const url =
  'https://raw.githubusercontent.com/cipherstash/encrypt-query-language/main/sql/schemas/cs_plaintext_v1.schema.json'
const response = await fetch(url)
const data = await response.json()

console.log(JSON.stringify(data, null, 2))
await Bun.write('./cs_plaintext_v1.schema.json', JSON.stringify(data, null, 2))

await $`bun run generate-types`

console.log('Types generated!')
