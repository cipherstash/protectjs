import 'dotenv/config'
import { protect, LockContext, type CtsToken } from '@cipherstash/protect'
export const protectClient = await protect()

export const getLockContext = (cts_token?: CtsToken) => {
  if (!cts_token) {
    throw new Error(
      '[protect] A CTS token is required in order to get a lock context.',
    )
  }

  const lockContext = new LockContext({
    ctsToken: cts_token,
  })

  return lockContext
}
