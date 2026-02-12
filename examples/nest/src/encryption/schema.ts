import { encryptedColumn, encryptedTable } from '@cipherstash/stack'

export const users = encryptedTable('users', {
  email_encrypted: encryptedColumn('email_encrypted')
    .equality()
    .orderAndRange()
    .freeTextSearch(),
  phone_encrypted: encryptedColumn('phone_encrypted')
    .equality()
    .orderAndRange(),
  ssn_encrypted: encryptedColumn('ssn_encrypted').equality(),
})

export const orders = encryptedTable('orders', {
  address_encrypted: encryptedColumn('address_encrypted').freeTextSearch(),
  creditCard_encrypted: encryptedColumn('creditCard_encrypted').equality(),
})

// Export all schemas for easy import
export const schemas = [users, orders]
