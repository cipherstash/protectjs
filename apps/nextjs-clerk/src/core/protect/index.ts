import 'dotenv/config'
import {
  protect,
  LockContext,
  type CtsToken,
  csColumn,
  csTable,
} from '@cipherstash/protect'

export const users = csTable('users', {
  email: csColumn('email'),
})

export const protectClient = await protect(users)

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
