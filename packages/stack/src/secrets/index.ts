/**
 * Placeholder: Corrected Secrets client interface
 *
 * This file reflects the actual dashboard API endpoints as implemented in:
 *   apps/dashboard/src/app/api/secrets/{get,set,list,get-many,delete}/route.ts
 *
 * Key corrections from the original interface:
 *   1. get, list, get-many are GET endpoints (not POST) with query params
 *   2. get-many takes a comma-separated `names` string (not a JSON array)
 *   3. set and delete return { success, message } (not void)
 *   4. SecretMetadata fields (id, createdAt, updatedAt) are non-optional
 *   5. GetSecretResponse fields (createdAt, updatedAt) are non-optional
 *   6. get-many enforces min 2 names (comma required) and max 100 names
 */

import type { EncryptionClient } from '@/encryption/index.js'
import { encryptedToPgComposite } from '@/encryption/helpers'
import { Encryption } from '@/index'
import { encryptedColumn, encryptedTable } from '@/schema'
import type { Encrypted } from '@/types'
import { logger } from '@/utils/logger'
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
  environment: string
  workspaceCRN?: string
  clientId?: string
  clientKey?: string
  accessKey?: string
}

/**
 * Secret metadata returned from the API (list endpoint).
 * All fields are always present in API responses.
 */
export interface SecretMetadata {
  id: string
  name: string
  environment: string
  createdAt: string
  updatedAt: string
}

/**
 * API response for listing secrets.
 * GET /api/secrets/list?workspaceId=...&environment=...
 */
export interface ListSecretsResponse {
  environment: string
  secrets: SecretMetadata[]
}

/**
 * API response for getting a single secret.
 * GET /api/secrets/get?workspaceId=...&environment=...&name=...
 *
 * The `encryptedValue` is the raw value stored in the vault's `value` column,
 * which is the `{ data: Encrypted }` object that was passed to the set endpoint.
 */
export interface GetSecretResponse {
  name: string
  environment: string
  encryptedValue: {
    data: Encrypted
  }
  createdAt: string
  updatedAt: string
}

/**
 * API response for getting multiple secrets.
 * GET /api/secrets/get-many?workspaceId=...&environment=...&names=name1,name2,...
 *
 * Returns an array of GetSecretResponse objects.
 * Constraints:
 *   - `names` must be comma-separated (minimum 2 names)
 *   - Maximum 100 names per request
 */
export type GetManySecretsResponse = GetSecretResponse[]

/**
 * API response for setting a secret.
 * POST /api/secrets/set
 */
export interface SetSecretResponse {
  success: true
  message: string
}

/**
 * API request body for setting a secret.
 * POST /api/secrets/set
 */
export interface SetSecretRequest {
  workspaceId: string
  environment: string
  name: string
  encryptedValue: {
    data: Encrypted
  }
}

/**
 * API response for deleting a secret.
 * POST /api/secrets/delete
 */
export interface DeleteSecretResponse {
  success: true
  message: string
}

/**
 * API request body for deleting a secret.
 * POST /api/secrets/delete
 */
export interface DeleteSecretRequest {
  workspaceId: string
  environment: string
  name: string
}

/**
 * API error response for plan limit violations (403).
 * Returned by POST /api/secrets/set when the workspace has reached its secret limit.
 */
export interface PlanLimitError {
  error: string
  code: 'PLAN_LIMIT_REACHED'
}

export interface DecryptedSecretResponse {
  name: string
  environment: string
  value: string
  createdAt: string
  updatedAt: string
}

/**
 * The Secrets client provides a high-level API for managing encrypted secrets
 * stored in CipherStash. Secrets are encrypted locally before being sent to
 * the API, ensuring end-to-end encryption.
 */
export class Secrets {
  private encryptionClient: EncryptionClient | null = null
  private config: Required<SecretsConfig>
  private readonly apiBaseUrl =
    process.env.STASH_API_URL || 'https://dashboard.cipherstash.com/api/secrets'
  private readonly secretsSchema = encryptedTable('secrets', {
    value: encryptedColumn('value'),
  })

  constructor(config: SecretsConfig) {
    const workspaceCRN = config.workspaceCRN ?? process.env.CS_WORKSPACE_CRN
    const clientId = config.clientId ?? process.env.CS_CLIENT_ID
    const clientKey = config.clientKey ?? process.env.CS_CLIENT_KEY
    const accessKey = config.accessKey ?? process.env.CS_CLIENT_ACCESS_KEY

    if (!workspaceCRN || !clientId || !clientKey || !accessKey) {
      throw new Error(
        'Missing required configuration or environment variables.',
      )
    }

    this.config = {
      environment: config.environment,
      workspaceCRN,
      clientId,
      clientKey,
      accessKey,
    }
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
    logger.debug('Initializing the Secrets client.')

    this.encryptionClient = await Encryption({
      schemas: [this.secretsSchema],
      config: {
        workspaceCrn: this.config.workspaceCRN,
        clientId: this.config.clientId,
        clientKey: this.config.clientKey,
        accessKey: this.config.accessKey,
        keyset: { name: this.config.environment },
      },
    })

    logger.debug('Successfully initialized the Secrets client.')
  }

  /**
   * Get the authorization header for API requests
   */
  private getAuthHeader(): string {
    return `Bearer ${this.config.accessKey}`
  }

  /**
   * Make an API request with error handling.
   *
   * For GET requests, `params` are appended as URL query parameters.
   * For POST requests, `body` is sent as JSON in the request body.
   */
  private async apiRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    options?: {
      body?: unknown
      params?: Record<string, string>
    },
  ): Promise<Result<T, SecretsError>> {
    try {
      let url = `${this.apiBaseUrl}${path}`

      if (options?.params) {
        const searchParams = new URLSearchParams(options.params)
        url = `${url}?${searchParams.toString()}`
      }

      logger.debug(`Secrets API request: ${method} ${path}`)

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: this.getAuthHeader(),
      }

      const response = await fetch(url, {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `API request failed with status ${response.status}`
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.message || errorJson.error || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }

        logger.error(`Secrets API error on ${method} ${path}: ${errorMessage}`)

        return {
          failure: {
            type: 'ApiError',
            message: errorMessage,
          },
        }
      }

      logger.debug(`Secrets API request successful: ${method} ${path}`)

      const data = await response.json()
      return { data }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown network error occurred'

      logger.error(`Secrets network error on ${method} ${path}: ${message}`)

      return {
        failure: {
          type: 'NetworkError',
          message,
        },
      }
    }
  }

  /**
   * Store an encrypted secret in the vault.
   * The value is encrypted locally before being sent to the API.
   *
   * API: POST /api/secrets/set
   *
   * @param name - The name of the secret
   * @param value - The plaintext value to encrypt and store
   * @returns A Result containing the API response or an error
   */
  async set(
    name: SecretName,
    value: SecretValue,
  ): Promise<Result<SetSecretResponse, SecretsError>> {
    logger.debug(`Setting secret: ${name}`)

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
      logger.error(
        `Failed to encrypt secret "${name}": ${encryptResult.failure.message}`,
      )
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
    return await this.apiRequest<SetSecretResponse>('POST', '/set', {
      body: {
        workspaceId,
        environment: this.config.environment,
        name,
        encryptedValue: encryptedToPgComposite(encryptResult.data),
      },
    })
  }

  /**
   * Retrieve and decrypt a secret from the vault.
   * The secret is decrypted locally after retrieval.
   *
   * API: GET /api/secrets/get?workspaceId=...&environment=...&name=...
   *
   * @param name - The name of the secret to retrieve
   * @returns A Result containing the decrypted value or an error
   */
  async get(name: SecretName): Promise<Result<SecretValue, SecretsError>> {
    logger.debug(`Getting secret: ${name}`)

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

    // Fetch encrypted value from API via GET with query params
    const apiResult = await this.apiRequest<GetSecretResponse>('GET', '/get', {
      params: {
        workspaceId,
        environment: this.config.environment,
        name,
      },
    })

    if (apiResult.failure) {
      return apiResult
    }

    // Decrypt the value locally
    const decryptResult = await this.encryptionClient.decrypt(
      apiResult.data.encryptedValue.data,
    )

    if (decryptResult.failure) {
      logger.error(
        `Failed to decrypt secret "${name}": ${decryptResult.failure.message}`,
      )
      return {
        failure: {
          type: 'DecryptionError',
          message: decryptResult.failure.message,
        },
      }
    }

    if (typeof decryptResult.data !== 'string') {
      logger.error(`Decrypted value for secret "${name}" is not a string.`)
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
   * API: GET /api/secrets/get-many?workspaceId=...&environment=...&names=name1,name2,...
   *
   * Constraints:
   *   - Minimum 2 secret names required
   *   - Maximum 100 secret names per request
   *
   * @param names - The names of the secrets to retrieve (min 2, max 100)
   * @returns A Result containing an object mapping secret names to their decrypted values
   */
  async getMany(
    names: SecretName[],
  ): Promise<Result<Record<SecretName, SecretValue>, SecretsError>> {
    logger.debug(`Getting ${names.length} secrets.`)

    await this.ensureInitialized()

    if (!this.encryptionClient) {
      return {
        failure: {
          type: 'ClientError',
          message: 'Failed to initialize Encryption client',
        },
      }
    }

    if (names.length < 2) {
      return {
        failure: {
          type: 'ClientError',
          message: 'At least 2 secret names are required for getMany',
        },
      }
    }

    if (names.length > 100) {
      return {
        failure: {
          type: 'ClientError',
          message: 'Maximum 100 secret names per request',
        },
      }
    }

    // Extract workspaceId from CRN
    const workspaceId = extractWorkspaceIdFromCrn(this.config.workspaceCRN)

    // Fetch encrypted values from API via GET with comma-separated names
    const apiResult = await this.apiRequest<GetManySecretsResponse>(
      'GET',
      '/get-many',
      {
        params: {
          workspaceId,
          environment: this.config.environment,
          names: names.join(','),
        },
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
      logger.error(
        `Failed to decrypt secrets: ${decryptResult.failure.message}`,
      )
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
   * API: GET /api/secrets/list?workspaceId=...&environment=...
   *
   * @returns A Result containing the list of secrets or an error
   */
  async list(): Promise<Result<SecretMetadata[], SecretsError>> {
    logger.debug('Listing secrets.')

    // Extract workspaceId from CRN
    const workspaceId = extractWorkspaceIdFromCrn(this.config.workspaceCRN)

    const apiResult = await this.apiRequest<ListSecretsResponse>(
      'GET',
      '/list',
      {
        params: {
          workspaceId,
          environment: this.config.environment,
        },
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
   * API: POST /api/secrets/delete
   *
   * @param name - The name of the secret to delete
   * @returns A Result containing the API response or an error
   */
  async delete(
    name: SecretName,
  ): Promise<Result<DeleteSecretResponse, SecretsError>> {
    logger.debug(`Deleting secret: ${name}`)

    // Extract workspaceId from CRN
    const workspaceId = extractWorkspaceIdFromCrn(this.config.workspaceCRN)

    return await this.apiRequest<DeleteSecretResponse>('POST', '/delete', {
      body: {
        workspaceId,
        environment: this.config.environment,
        name,
      },
    })
  }
}
