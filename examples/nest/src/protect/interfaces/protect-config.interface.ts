import type { ProtectTable, ProtectTableColumn } from '@cipherstash/protect'

export interface ProtectConfig {
  workspaceCrn: string
  clientId: string
  clientKey: string
  clientAccessKey: string
  logLevel?: 'debug' | 'info' | 'error'
  schemas?: ProtectTable<ProtectTableColumn>[]
}
