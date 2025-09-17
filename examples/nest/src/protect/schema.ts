import { csTable, csColumn } from '@cipherstash/protect'

export const users = csTable('users', {
  email_encrypted: csColumn('email_encrypted')
    .equality()
    .orderAndRange()
    .freeTextSearch(),
  phone_encrypted: csColumn('phone_encrypted').equality().orderAndRange(),
  ssn_encrypted: csColumn('ssn_encrypted').equality(),
})

export const orders = csTable('orders', {
  address_encrypted: csColumn('address_encrypted').freeTextSearch(),
  creditCard_encrypted: csColumn('creditCard_encrypted').equality(),
})

// Export all schemas for easy import
export const schemas = [users, orders]
