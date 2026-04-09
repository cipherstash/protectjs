import * as p from '@clack/prompts'
import { createStash, style } from './helpers.js'

export async function deleteSecret(flags: {
  name: string
  environment: string
  yes?: boolean
}) {
  const { name, environment, yes } = flags
  const stash = createStash(environment)

  if (!yes) {
    const confirmed = await p.confirm({
      message: `Are you sure you want to delete secret "${name}" from environment "${environment}"? This action cannot be undone.`,
    })

    if (p.isCancel(confirmed) || !confirmed) {
      console.log(style.info('Deletion cancelled.'))
      return
    }
  }

  console.log(
    `${style.info(`Deleting secret "${name}" from environment "${environment}"...`)}`,
  )

  const result = await stash.delete(name)
  if (result.failure) {
    console.error(
      style.error(`Failed to delete secret: ${result.failure.message}`),
    )
    process.exit(1)
  }

  console.log(
    style.success(
      `Secret "${name}" deleted successfully from environment "${environment}"`,
    ),
  )
}
