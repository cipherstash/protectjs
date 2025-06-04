import 'dotenv/config'
import {
  protect,
  csColumn,
  csTable,
  type ProtectClientConfig,
} from '@cipherstash/protect'

export const users = csTable('users', {
  name: csColumn('name'),
})

const config: ProtectClientConfig = {
  schemas: [users],
}

export const protectClient = await protect(config)
