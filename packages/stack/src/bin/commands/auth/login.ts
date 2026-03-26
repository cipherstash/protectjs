import * as p from '@clack/prompts'
import auth from '@cipherstash/auth'
const { beginDeviceCodeFlow, bindClientDevice } = auth

export async function login() {
  const s = p.spinner()

  const pending = await beginDeviceCodeFlow('ap-southeast-2.aws', 'cli')

  p.log.info(`Your code is: ${pending.userCode}`)
  p.log.info(`Visit: ${pending.verificationUriComplete}`)
  p.log.info(`Code expires in: ${pending.expiresIn}s`)

  const opened = pending.openInBrowser()
  if (!opened) {
    p.log.warn('Could not open browser — please visit the URL above manually.')
  }

  s.start('Waiting for authorization...')
  const auth = await pending.pollForToken()
  s.stop('Authenticated! Token saved to ~/.cipherstash/auth.json')

  p.log.info(
    `Token expires at: ${new Date(auth.expiresAt * 1000).toISOString()}`,
  )
}

export async function bindDevice() {
  const s = p.spinner()
  s.start('Binding device to the default Keyset...')

  try {
    await bindClientDevice()
    s.stop('Your device has been bound to the default Keyset!')
  } catch (error) {
    s.stop('Failed to bind your device to the default Keyset!')
    p.log.error(error instanceof Error ? error.message : 'Unknown error')
    process.exit(1)
  }
}
