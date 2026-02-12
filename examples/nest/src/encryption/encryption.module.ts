import {
  type EncryptedTable,
  type EncryptedTableColumn,
  Encryption,
  type EncryptionClient,
  type EncryptionClientConfig,
} from '@cipherstash/stack'
import { type DynamicModule, Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ENCRYPTION_CLIENT, ENCRYPTION_CONFIG } from './encryption.constants'
import { EncryptionService } from './encryption.service'
import type { EncryptionConfig } from './interfaces/encryption-config.interface'
import { users } from './schema'

@Global()
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS module
export class EncryptionModule {
  static forRoot(config?: Partial<EncryptionConfig>): DynamicModule {
    return {
      module: EncryptionModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: ENCRYPTION_CONFIG,
          useFactory: (configService: ConfigService): EncryptionConfig => {
            const workspaceCrn = configService.get<string>('CS_WORKSPACE_CRN')
            const clientId = configService.get<string>('CS_CLIENT_ID')
            const clientKey = configService.get<string>('CS_CLIENT_KEY')
            const clientAccessKey = configService.get<string>(
              'CS_CLIENT_ACCESS_KEY',
            )

            const defaultConfig: EncryptionConfig = {
              workspaceCrn: workspaceCrn ?? '',
              clientId: clientId ?? '',
              clientKey: clientKey ?? '',
              clientAccessKey: clientAccessKey ?? '',
              logLevel: configService.get<'debug' | 'info' | 'error'>(
                'PROTECT_LOG_LEVEL',
                'info',
              ),
              ...config,
            }

            // Validate required configuration
            if (!defaultConfig.workspaceCrn) {
              throw new Error('CS_WORKSPACE_CRN is required')
            }
            if (!defaultConfig.clientId) {
              throw new Error('CS_CLIENT_ID is required')
            }
            if (!defaultConfig.clientKey) {
              throw new Error('CS_CLIENT_KEY is required')
            }
            if (!defaultConfig.clientAccessKey) {
              throw new Error('CS_CLIENT_ACCESS_KEY is required')
            }

            return defaultConfig
          },
          inject: [ConfigService],
        },
        {
          provide: ENCRYPTION_CLIENT,
          useFactory: async (
            config: EncryptionConfig,
          ): Promise<EncryptionClient> => {
            const encryptionConfig: EncryptionClientConfig = {
              schemas: (config.schemas && config.schemas.length > 0
                ? config.schemas
                : [users]) as [
                EncryptedTable<EncryptedTableColumn>,
                ...EncryptedTable<EncryptedTableColumn>[],
              ],
            }

            return await Encryption(encryptionConfig)
          },
          inject: [ENCRYPTION_CONFIG],
        },
        EncryptionService,
      ],
      exports: [EncryptionService, ENCRYPTION_CLIENT],
    }
  }

  static forRootAsync(options: {
    useFactory: (
      ...args: unknown[]
    ) => Promise<EncryptionConfig> | EncryptionConfig
    inject?: unknown[]
  }): DynamicModule {
    return {
      module: EncryptionModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: ENCRYPTION_CONFIG,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        {
          provide: ENCRYPTION_CLIENT,
          useFactory: async (
            config: EncryptionConfig,
          ): Promise<EncryptionClient> => {
            const encryptionConfig: EncryptionClientConfig = {
              schemas: (config.schemas && config.schemas.length > 0
                ? config.schemas
                : [users]) as [
                EncryptedTable<EncryptedTableColumn>,
                ...EncryptedTable<EncryptedTableColumn>[],
              ],
            }

            return await Encryption(encryptionConfig)
          },
          inject: [ENCRYPTION_CONFIG],
        },
        EncryptionService,
      ],
      exports: [EncryptionService, ENCRYPTION_CLIENT],
    }
  }
}
