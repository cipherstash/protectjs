import { createStash, style } from './helpers.js'

export async function setSecret(flags: {
  name: string
  value: string
  environment: string
}) {
  const { name, value, environment } = flags
  const stash = createStash(environment)

  console.log(
    `${style.info(`Encrypting and storing secret "${name}" in environment "${environment}"...`)}`,
  )

  const result = await stash.set(name, value)
  if (result.failure) {
    console.error(
      style.error(`Failed to set secret: ${result.failure.message}`),
    )
    process.exit(1)
  }

  console.log(
    style.success(
      `Secret "${name}" stored successfully in environment "${environment}"`,
    ),
  )
}
