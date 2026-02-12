import type { ExecutionContext } from '@nestjs/common'
import type { ModuleRef } from '@nestjs/core'
import { EncryptionService } from '../protect.service'

export function getEncryptionService(
  ctx: ExecutionContext,
): EncryptionService | null {
  try {
    const app = ctx.switchToHttp().getRequest().app
    if (app?.get) {
      return app.get(EncryptionService)
    }

    // Fallback: try to get from module ref if available
    const moduleRef = ctx.switchToHttp().getRequest().moduleRef as ModuleRef
    if (moduleRef) {
      return moduleRef.get(EncryptionService, { strict: false })
    }

    return null
  } catch (error) {
    return null
  }
}
