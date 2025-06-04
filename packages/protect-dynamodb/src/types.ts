import type { ProtectClient, Decrypted } from '@cipherstash/protect'
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

export interface ProtectDynamoDBConfig {
  protectClient: ProtectClient
  dynamoClient: DynamoDBClient
  docClient: DynamoDBDocumentClient
}

export interface ProtectDynamoDBInstance {
  encryptModel: <T extends Record<string, unknown>>(
    item: T,
    protectTable: any, // TODO: Import proper type from @cipherstash/protect
  ) => Promise<Record<string, unknown>>

  bulkEncryptModels: <T extends Record<string, unknown>>(
    items: T[],
    protectTable: any, // TODO: Import proper type from @cipherstash/protect
  ) => Promise<Record<string, unknown>[]>

  decryptModel: <T extends Record<string, unknown>>(
    item: Record<string, unknown>,
    protectTable: any, // TODO: Import proper type from @cipherstash/protect
  ) => Promise<Decrypted<T>>

  bulkDecryptModels: <T extends Record<string, unknown>>(
    items: Record<string, unknown>[],
    protectTable: any, // TODO: Import proper type from @cipherstash/protect
  ) => Promise<Decrypted<T>[]>

  makeSearchTerm: (
    plaintext: string,
    protectColumn: any, // TODO: Import proper type from @cipherstash/protect
    protectTable: any, // TODO: Import proper type from @cipherstash/protect
  ) => Promise<string>
}
