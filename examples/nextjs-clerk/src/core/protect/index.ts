import 'dotenv/config'
import {
  type CtsToken,
  LockContext,
  type ProtectClientConfig,
  csColumn,
  csTable,
  protect,
} from '@cipherstash/protect'

export const users = csTable('users', {
  email: csColumn('email'),
})

const config: ProtectClientConfig = {
  schemas: [users],
}

export const protectClient = await protect(config)

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
