import { logger } from '../logger'

let message = ''
const errorMessage = (message: string) => `Initialization error: ${message}`

export const checkEnvironmentVariables = () => {
  if (!process.env.CS_WORKSPACE_ID) {
    message = errorMessage(
      'The environment variable "CS_WORKSPACE_ID" must be set. You can find your workspace ID in the CipherStash dashboard.',
    )

    logger.error(message)
    throw new Error(`[ Server ] jseql: ${message}`)
  }

  if (!process.env.CS_CLIENT_ID || !process.env.CS_CLIENT_KEY) {
    message = errorMessage(
      'The environment variables "CS_CLIENT_ID" and "CS_CLIENT_KEY" must be set. You must use the CipherStash CLI to generate a new client key pair.',
    )

    logger.error(message)
    throw new Error(`[ Server ] jseql: ${message}`)
  }

  if (!process.env.CS_CLIENT_ACCESS_KEY) {
    message = errorMessage(
      'The environment variable "CS_CLIENT_ACCESS_KEY" must be set. Generate a new access token in the CipherStash dashboard or CLI.',
    )

    logger.error(message)
    throw new Error(`[ Server ] jseql: ${message}`)
  }
}
