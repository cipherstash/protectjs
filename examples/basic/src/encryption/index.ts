import { encryptedTable, encryptedColumn } from '@cipherstash/stack/schema'
import { Encryption } from '@cipherstash/stack'

export const helloTable = encryptedTable('hello', {
  world: encryptedColumn('world').equality().orderAndRange(),
  name: encryptedColumn('name').equality().freeTextSearch(),
  age: encryptedColumn('age').dataType('number').equality().orderAndRange(),
})

export const encryptionClient = await Encryption({
  schemas: [helloTable],
})
