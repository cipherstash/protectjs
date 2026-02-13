import type { EncryptionClient } from '@/encryption/ffi'
import { encryptedToPgComposite } from '@/encryption/helpers'
import { Encryption } from '@/index'
import { encryptedColumn, encryptedTable } from '@/schema'
import type { Encrypted } from '@/types'
import type { Result } from '@byteslice/result'
import { extractWorkspaceIdFromCrn } from '../utils/config/index.js'

export type SecretName = string
export type SecretValue = string

/**
 * Discriminated error type for secrets operations.
 */
export type SecretsErrorType =
  | 'ApiError'
  | 'NetworkError'
  | 'ClientError'
  | 'EncryptionError'
  | 'DecryptionError'

/**
 * Error returned by secrets operations.
 */
export interface SecretsError {
  type: SecretsErrorType
  message: string
}

/**
 * Configuration options for initializing the Stash client
 */
export interface SecretsConfig {
  workspaceCRN: string
  clientId: string
  clientKey: string
  environment: string
  apiKey: string
  accessKey?: string
}

/**
 * Secret metadata returned from the API
 */
export interface SecretMetadata {
  id?: string
  name: string
  environment: string
  createdAt?: string
  updatedAt?: string
}

/**
 * API response for listing secrets
 */
export interface ListSecretsResponse {
  environment: string
  secrets: SecretMetadata[]
}

/**
 * API response for getting a secret
 */
export interface GetSecretResponse {
  name: string
  environment: string
  encryptedValue: {
    data: Encrypted
  }
  createdAt?: string
  updatedAt?: string
}

export interface DecryptedSecretResponse {
  name: string
  environment: string
  value: string
  createdAt?: string
  updatedAt?: string
}

/**
 * The Stash client provides a high-level API for managing encrypted secrets
 * stored in CipherStash. Secrets are encrypted locally before being sent to
 * the API, ensuring end-to-end encryption.
 */
export class Secrets {
  private encryptionClient: EncryptionClient | null = null
  private config: SecretsConfig
  private readonly apiBaseUrl =
    process.env.STASH_API_URL || 'https://dashboard.cipherstash.com/api/secrets'
  private readonly secretsSchema = encryptedTable('secrets', {
    value: encryptedColumn('value'),
  })

  constructor(config: SecretsConfig) {
    this.config = config
  }

  private initPromise: Promise<void> | null = null

  /**
   * Initialize the Secrets client and underlying Encryption client
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this._doInit()
    }
    return this.initPromise
  }

  private async _doInit(): Promise<void> {
    this.encryptionClient = await Encryption({
      schemas: [this.secretsSchema],
      config: {
        workspaceCrn: this.config.workspaceCRN,
        clientId: this.config.clientId,
        clientKey: this.config.clientKey,
        accessKey: this.config.apiKey,
        keyset: {
          name: this.config.environment,
        },
      },
    })
  }

  /**
   * Get the authorization header for API requests
   */
  private getAuthHeader(): string {
    return `Bearer ${this.config.apiKey}`
  }

  /**
   * Make an API request with error handling
   */
  private async apiRequest<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Result<T, SecretsError>> {
    try {
      const url = `${this.apiBaseUrl}${path}`
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: this.getAuthHeader(),
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `API request failed with status ${response.status}`
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.message || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }

        return {
          failure: {
            type: 'ApiError',
            message: errorMessage,
          },
        }
      }

      const data = await response.json()
      return { data }
    } catch (error) {
      return {
        failure: {
          type: 'NetworkError',
          message:
            error instanceof Error
              ? error.message
              : 'Unknown network error occurred',
        },
      }
    }
  }

  /**
   * Store an encrypted secret in the vault.
   * The value is encrypted locally before being sent to the API.
   *
   * @param name - The name of the secret
   * @param value - The plaintext value to encrypt and store
   * @returns A Result indicating success or failure
   *
   * @example
   * ```typescript
   * const stash = new Secrets({ ... })
   * const result = await stash.set('DATABASE_URL', 'postgres://user:pass@localhost:5432/mydb')
   * if (result.failure) {
   *   console.error('Failed to set secret:', result.failure.message)
   * }
   * ```
   */
  async set(
    name: SecretName,
    value: SecretValue,
  ): Promise<Result<void, SecretsError>> {
    await this.ensureInitialized()

    if (!this.encryptionClient) {
      return {
        failure: {
          type: 'ClientError',
          message: 'Failed to initialize Encryption client',
        },
      }
    }

    // Encrypt the value locally
    const encryptResult = await this.encryptionClient.encrypt(value, {
      column: this.secretsSchema.value,
      table: this.secretsSchema,
    })

    if (encryptResult.failure) {
      return {
        failure: {
          type: 'EncryptionError',
          message: encryptResult.failure.message,
        },
      }
    }

    // Extract workspaceId from CRN
    const workspaceId = extractWorkspaceIdFromCrn(this.config.workspaceCRN)

    // Send encrypted value to API
    return await this.apiRequest<void>('POST', '/set', {
      workspaceId,
      environment: this.config.environment,
      name,
      encryptedValue: encryptedToPgComposite(encryptResult.data),
    })
  }

  /**
   * Retrieve and decrypt a secret from the vault.
   * The secret is decrypted locally after retrieval.
   *
   * @param name - The name of the secret to retrieve
   * @returns A Result containing the decrypted value or an error
   *
   * @example
   * ```typescript
   * const stash = new Secrets({ ... })
   * const result = await stash.get('DATABASE_URL')
   * if (result.failure) {
   *   console.error('Failed to get secret:', result.failure.message)
   * } else {
   *   console.log('Secret value:', result.data)
   * }
   * ```
   */
  async get(name: SecretName): Promise<Result<SecretValue, SecretsError>> {
    await this.ensureInitialized()

    if (!this.encryptionClient) {
      return {
        failure: {
          type: 'ClientError',
          message: 'Failed to initialize Encryption client',
        },
      }
    }

    // Extract workspaceId from CRN
    const workspaceId = extractWorkspaceIdFromCrn(this.config.workspaceCRN)

    // Fetch encrypted value from API
    const apiResult = await this.apiRequest<GetSecretResponse>('POST', '/get', {
      workspaceId,
      environment: this.config.environment,
      name,
    })

    if (apiResult.failure) {
      return apiResult
    }

    // Decrypt the value locally
    const decryptResult = await this.encryptionClient.decrypt(
      apiResult.data.encryptedValue.data,
    )

    if (decryptResult.failure) {
      return {
        failure: {
          type: 'DecryptionError',
          message: decryptResult.failure.message,
        },
      }
    }

    if (typeof decryptResult.data !== 'string') {
      return {
        failure: {
          type: 'DecryptionError',
          message: 'Decrypted value is not a string',
        },
      }
    }

    return { data: decryptResult.data }
  }

  /**
   * Retrieve and decrypt many secrets from the vault.
   * The secrets are decrypted locally after retrieval.
   * This method only triggers a single network request to the ZeroKMS.
   *
   * @param names - The names of the secrets to retrieve
   * @returns A Result containing an object mapping secret names to their decrypted values
   *
   * @example
   * ```typescript
   * const stash = new Secrets({ ... })
   * const result = await stash.getMany(['DATABASE_URL', 'API_KEY'])
   * if (result.failure) {
   *   console.error('Failed to get secrets:', result.failure.message)
   * } else {
   *   const dbUrl = result.data.DATABASE_URL // Access by name
   *   const apiKey = result.data.API_KEY
   * }
   * ```
   */
  async getMany(
    names: SecretName[],
  ): Promise<Result<Record<SecretName, SecretValue>, SecretsError>> {
    await this.ensureInitialized()

    if (!this.encryptionClient) {
      return {
        failure: {
          type: 'ClientError',
          message: 'Failed to initialize Encryption client',
        },
      }
    }

    // Extract workspaceId from CRN
    const workspaceId = extractWorkspaceIdFromCrn(this.config.workspaceCRN)

    // Fetch encrypted value from API
    const apiResult = await this.apiRequest<GetSecretResponse[]>(
      'POST',
      '/get-many',
      {
        workspaceId,
        environment: this.config.environment,
        names,
      },
    )

    if (apiResult.failure) {
      return apiResult
    }

    const dataToDecrypt = apiResult.data.map((item) => ({
      name: item.name,
      value: item.encryptedValue.data,
    }))

    const decryptResult =
      await this.encryptionClient.bulkDecryptModels(dataToDecrypt)

    if (decryptResult.failure) {
      return {
        failure: {
          type: 'DecryptionError',
          message: decryptResult.failure.message,
        },
      }
    }

    // Transform array of decrypted secrets into an object keyed by secret name
    const decryptedSecrets =
      decryptResult.data as unknown as DecryptedSecretResponse[]
    const secretsMap: Record<SecretName, SecretValue> = {}

    for (const secret of decryptedSecrets) {
      if (secret.name && secret.value) {
        secretsMap[secret.name] = secret.value
      }
    }

    return { data: secretsMap }
  }

  /**
   * List all secrets in the environment.
   * Only names and metadata are returned; values remain encrypted.
   *
   * @returns A Result containing the list of secrets or an error
   *
   * @example
   * ```typescript
   * const stash = new Secrets({ ... })
   * const result = await stash.list()
   * if (result.failure) {
   *   console.error('Failed to list secrets:', result.failure.message)
   * } else {
   *   console.log('Secrets:', result.data)
   * }
   * ```
   */
  async list(): Promise<Result<SecretMetadata[], SecretsError>> {
    // Extract workspaceId from CRN
    const workspaceId = extractWorkspaceIdFromCrn(this.config.workspaceCRN)

    const apiResult = await this.apiRequest<ListSecretsResponse>(
      'POST',
      '/list',
      {
        workspaceId,
        environment: this.config.environment,
      },
    )

    if (apiResult.failure) {
      return apiResult
    }

    return { data: apiResult.data.secrets }
  }

  /**
   * Delete a secret from the vault.
   *
   * @param name - The name of the secret to delete
   * @returns A Result indicating success or failure
   *
   * @example
   * ```typescript
   * const stash = new Secrets({ ... })
   * const result = await stash.delete('DATABASE_URL')
   * if (result.failure) {
   *   console.error('Failed to delete secret:', result.failure.message)
   * }
   * ```
   */
  async delete(name: SecretName): Promise<Result<void, SecretsError>> {
    // Extract workspaceId from CRN
    const workspaceId = extractWorkspaceIdFromCrn(this.config.workspaceCRN)

    return await this.apiRequest<void>('POST', '/delete', {
      workspaceId,
      environment: this.config.environment,
      name,
    })
  }
}
