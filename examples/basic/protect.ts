import 'dotenv/config'
import {
  type ProtectClientConfig,
  csColumn,
  csTable,
  protect,
} from '@cipherstash/protect'

export const users = csTable('users', {
  name: csColumn('name').equality().orderAndRange().freeTextSearch(),
  data: csColumn('data').dataType('json').searchableJson(),
})

const config: ProtectClientConfig = {
  schemas: [users],
}

export const protectClient = await protect(config)
