// This module is the CJS entry point for the library.

// The Rust addon.
import * as addon from './load.cjs'

// Use this declaration to assign types to the protects's exports,
// which otherwise by default are `any`.
declare module './load.cjs' {
  interface Client {}

  function newClient(): Promise<Client>
  function encrypt(
    client: Client,
    plaintext: string,
    columnName: string,
    context?: Context,
    ctsToken?: CtsToken,
  ): Promise<string>
  function decrypt(
    client: Client,
    ciphertext: string,
    context?: Context,
    ctsToken?: CtsToken,
  ): Promise<string>
  function encryptBulk(
    client: Client,
    plaintextTargets: BulkEncryptPayload[],
    ctsToken?: CtsToken,
  ): Promise<string[]>
  function decryptBulk(
    client: Client,
    ciphertexts: BulkDecryptPayload[],
    ctsToken?: CtsToken,
  ): Promise<string[]>
}

export function newClient(): Promise<addon.Client> {
  return addon.newClient()
}

export function encrypt(
  client: addon.Client,
  plaintext: string,
  columnName: string,
  lockContext?: Context,
  ctsToken?: CtsToken,
): Promise<string> {
  if (ctsToken) {
    return addon.encrypt(client, plaintext, columnName, lockContext, ctsToken)
  }

  if (lockContext) {
    return addon.encrypt(client, plaintext, columnName, lockContext)
  }

  return addon.encrypt(client, plaintext, columnName)
}

export function decrypt(
  client: addon.Client,
  ciphertext: string,
  lockContext?: Context,
  ctsToken?: CtsToken,
): Promise<string> {
  if (ctsToken) {
    return addon.decrypt(client, ciphertext, lockContext, ctsToken)
  }

  if (lockContext) {
    return addon.decrypt(client, ciphertext, lockContext)
  }

  return addon.decrypt(client, ciphertext)
}

export function encryptBulk(
  client: addon.Client,
  plaintextTargets: BulkEncryptPayload[],
  ctsToken?: CtsToken,
): Promise<string[]> {
  if (ctsToken) {
    return addon.encryptBulk(client, plaintextTargets, ctsToken)
  }

  return addon.encryptBulk(client, plaintextTargets)
}

export function decryptBulk(
  client: addon.Client,
  ciphertexts: BulkDecryptPayload[],
  ctsToken?: CtsToken,
): Promise<string[]> {
  if (ctsToken) {
    return addon.decryptBulk(client, ciphertexts, ctsToken)
  }

  return addon.decryptBulk(client, ciphertexts)
}

export type BulkEncryptPayload = {
  plaintext: string
  column: string
  lockContext?: Context
}

export type BulkDecryptPayload = {
  ciphertext: string
  lockContext?: Context
}

export type CtsToken = {
  accessToken: string
  expiry: number
}

export type Context = {
  identityClaim: string[]
}

export type EncryptedEqlPayload = {
  c: string
}

export type BulkEncryptedEqlPayload = {
  c: string
  id: string
}[]
