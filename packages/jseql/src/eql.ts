// TODO: Fix ffi build so that we can import it directly
const { newClient, encrypt, decrypt } = require('@cipherstash/jseql-ffi')

export class EqlClient {
  // biome-ignore lint/suspicious/noExplicitAny: jseql-ffi is not typed
  private client: any
  private workspaceId
  private clientId
  private clientKey

  constructor({
    workspaceId,
    clientId,
    clientKey,
  }: {
    workspaceId: string
    clientId: string
    clientKey: string
  }) {
    this.workspaceId = workspaceId
    this.clientId = clientId
    this.clientKey = clientKey
  }

  async init(): Promise<EqlClient> {
    const client = await newClient()
    this.client = client
    return this
  }

  async encrypt({
    plaintext,
    column,
    table,
  }: {
    plaintext: string
    column: string
    table: string
  }): Promise<EncryptedEqlPayload> {
    return await encrypt(plaintext, column, this.client).then((val: string) => {
      return { c: val }
    })
  }

  async decrypt(encryptedPayload: EncryptedEqlPayload): Promise<string> {
    return await decrypt(encryptedPayload.c, this.client)
  }
}

export type EncryptedEqlPayload = {
  c: string
}
