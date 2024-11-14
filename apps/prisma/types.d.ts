import type { CsEncryptedV1Schema } from '@jseql/eql'

declare global {
  namespace PrismaJson {
    type CsEncryptedType = CsEncryptedV1Schema
  }
}
