import { EqlClient } from './ffi'

export const eql = (): Promise<EqlClient> => {
  const client = new EqlClient()
  return client.init()
}

export type { EqlClient } from './ffi'
export * from './cs_plaintext_v1'
export * from './identify'
export * from './eql'
