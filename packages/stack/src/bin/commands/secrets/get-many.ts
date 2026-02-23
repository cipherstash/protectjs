import { createStash, style } from './helpers.js'

export async function getManySecrets(flags: {
  names: string[]
  environment: string
}) {
  const { names, environment } = flags
  const stash = createStash(environment)

  console.log(
    `${style.info(`Retrieving ${names.length} secrets from environment "${environment}"...`)}`,
  )

  const result = await stash.getMany(names)
  if (result.failure) {
    console.error(
      style.error(`Failed to get secrets: ${result.failure.message}`),
    )
    process.exit(1)
  }

  console.log(`\n${style.title('Secrets:')}\n`)
  for (const [name, value] of Object.entries(result.data)) {
    console.log(`${style.label(`${name}:`)}`)
    console.log(`${style.value(value)}\n`)
  }
}
