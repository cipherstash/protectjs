import { colors, createStash, style } from './helpers.js'

export async function listSecrets(flags: { environment: string }) {
  const { environment } = flags
  const stash = createStash(environment)

  console.log(
    `${style.info(`Listing secrets in environment "${environment}"...`)}`,
  )

  const result = await stash.list()
  if (result.failure) {
    console.error(
      style.error(`Failed to list secrets: ${result.failure.message}`),
    )
    process.exit(1)
  }

  if (result.data.length === 0) {
    console.log(
      `\n${style.warning(`No secrets found in environment "${environment}"`)}`,
    )
    return
  }

  console.log(`\n${style.title(`Secrets in environment "${environment}":`)}\n`)

  for (const secret of result.data) {
    const name = style.value(secret.name)
    const metadata: string[] = []
    if (secret.createdAt) {
      metadata.push(
        `${style.label('created:')} ${new Date(secret.createdAt).toLocaleString()}`,
      )
    }
    if (secret.updatedAt) {
      metadata.push(
        `${style.label('updated:')} ${new Date(secret.updatedAt).toLocaleString()}`,
      )
    }

    const metaStr =
      metadata.length > 0
        ? ` ${colors.dim}(${metadata.join(', ')})${colors.reset}`
        : ''
    console.log(`  ${style.bullet()} ${name}${metaStr}`)
  }

  console.log(
    `\n${style.label(`Total: ${result.data.length} secret${result.data.length === 1 ? '' : 's'}`)}`,
  )
}
