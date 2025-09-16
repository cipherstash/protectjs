import {
  protect,
  csColumn,
  csTable,
  type ProtectClientConfig,
  type ProtectClient,
} from '@cipherstash/protect'

export const users = csTable('users', {
  email_encrypted: csColumn('email_encrypted')
    .equality()
    .orderAndRange()
    .freeTextSearch(),
})

const config: ProtectClientConfig = {
  schemas: [users],
}

let instance: ProtectClient | null = null
let initializationPromise: Promise<ProtectClient> | null = null

export async function getProtectInstance(): Promise<ProtectClient> {
  if (instance) {
    return instance
  }

  if (initializationPromise) {
    return initializationPromise
  }

  initializationPromise = protect(config)
  instance = await initializationPromise
  return instance
}

export function resetProtectInstance(): void {
  instance = null
  initializationPromise = null
}

export const protectClient = getProtectInstance()
