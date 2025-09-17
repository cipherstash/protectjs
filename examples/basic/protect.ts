import 'dotenv/config'
import {
  type ProtectClientConfig,
  csColumn,
  csTable,
  protect,
} from '@cipherstash/protect'

export const users = csTable('users', {
  name: csColumn('name'),
})

const config: ProtectClientConfig = {
  schemas: [users],
}

export const protectClient = await protect(config)
