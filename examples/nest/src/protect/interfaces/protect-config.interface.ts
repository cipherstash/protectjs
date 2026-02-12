import type { EncryptedTable, EncryptedTableColumn } from '@cipherstash/stack'

export interface EncryptionConfig {
  workspaceCrn: string
  clientId: string
  clientKey: string
  clientAccessKey: string
  logLevel?: 'debug' | 'info' | 'error'
  schemas?: EncryptedTable<EncryptedTableColumn>[]
}
