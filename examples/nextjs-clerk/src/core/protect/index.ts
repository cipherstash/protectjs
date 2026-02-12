import 'dotenv/config'
import {
  type CtsToken,
  Encryption,
  type EncryptionClientConfig,
  LockContext,
  encryptedColumn,
  encryptedTable,
} from '@cipherstash/stack'

export const users = encryptedTable('users', {
  email: encryptedColumn('email'),
})

const config: EncryptionClientConfig = {
  schemas: [users],
}

export const encryptionClient = await Encryption(config)

export const getLockContext = (cts_token?: CtsToken) => {
  if (!cts_token) {
    throw new Error(
      '[encryption] A CTS token is required in order to get a lock context.',
    )
  }

  const lockContext = new LockContext({
    ctsToken: cts_token,
  })

  return lockContext
}
