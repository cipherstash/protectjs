import { ProtectClient } from './ffi'

export const protect = (): Promise<ProtectClient> => {
  const client = new ProtectClient()
  return client.init()
}

export type { ProtectClient } from './ffi'
export * from './cs_plaintext_v1'
export * from './identify'
export * from './eql'
