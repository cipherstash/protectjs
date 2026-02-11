import 'dotenv/config'
import {
  type CtsToken,
  LockContext,
  type EncryptionClientConfig,
  encryptedColumn,
  encryptedTable,
  Encryption,
} from '@cipherstash/stack'

export const users = encryptedTable('users', {
  email: encryptedColumn('email'),
})

const config: EncryptionClientConfig = {
  schemas: [users],
}

export const protectClient = await Encryption(config)

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
