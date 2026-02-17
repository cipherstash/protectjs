import { createStash, style } from './helpers.js'

export async function getSecret(flags: {
  name: string
  environment: string
}) {
  const { name, environment } = flags
  const stash = createStash(environment)

  console.log(
    `${style.info(`Retrieving secret "${name}" from environment "${environment}"...`)}`,
  )

  const result = await stash.get(name)
  if (result.failure) {
    console.error(
      style.error(`Failed to get secret: ${result.failure.message}`),
    )
    process.exit(1)
  }

  console.log(`\n${style.title('Secret Value:')}`)
  console.log(style.value(result.data))
}
