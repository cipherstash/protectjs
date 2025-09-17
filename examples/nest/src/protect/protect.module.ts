import { Module, type DynamicModule, Global } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import {
  protect,
  type ProtectClientConfig,
  type ProtectClient,
  type ProtectTable,
  type ProtectTableColumn,
} from '@cipherstash/protect'
import { ProtectService } from './protect.service'
import type { ProtectConfig } from './interfaces/protect-config.interface'
import { PROTECT_CONFIG, PROTECT_CLIENT } from './protect.constants'
import { users } from './schema'

@Global()
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS module
export class ProtectModule {
  static forRoot(config?: Partial<ProtectConfig>): DynamicModule {
    return {
      module: ProtectModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: PROTECT_CONFIG,
          useFactory: (configService: ConfigService): ProtectConfig => {
            const defaultConfig: ProtectConfig = {
              workspaceCrn: configService.get<string>('CS_WORKSPACE_CRN')!,
              clientId: configService.get<string>('CS_CLIENT_ID')!,
              clientKey: configService.get<string>('CS_CLIENT_KEY')!,
              clientAccessKey: configService.get<string>(
                'CS_CLIENT_ACCESS_KEY',
              )!,
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
          provide: PROTECT_CLIENT,
          useFactory: async (config: ProtectConfig): Promise<ProtectClient> => {
            const protectConfig: ProtectClientConfig = {
              schemas: (config.schemas && config.schemas.length > 0
                ? config.schemas
                : [users]) as [
                ProtectTable<ProtectTableColumn>,
                ...ProtectTable<ProtectTableColumn>[],
              ],
            }

            return await protect(protectConfig)
          },
          inject: [PROTECT_CONFIG],
        },
        ProtectService,
      ],
      exports: [ProtectService, PROTECT_CLIENT],
    }
  }

  static forRootAsync(options: {
    useFactory: (...args: any[]) => Promise<ProtectConfig> | ProtectConfig
    inject?: any[]
  }): DynamicModule {
    return {
      module: ProtectModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: PROTECT_CONFIG,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        {
          provide: PROTECT_CLIENT,
          useFactory: async (config: ProtectConfig): Promise<ProtectClient> => {
            const protectConfig: ProtectClientConfig = {
              schemas: (config.schemas && config.schemas.length > 0
                ? config.schemas
                : [users]) as [
                ProtectTable<ProtectTableColumn>,
                ...ProtectTable<ProtectTableColumn>[],
              ],
            }

            return await protect(protectConfig)
          },
          inject: [PROTECT_CONFIG],
        },
        ProtectService,
      ],
      exports: [ProtectService, PROTECT_CLIENT],
    }
  }
}
