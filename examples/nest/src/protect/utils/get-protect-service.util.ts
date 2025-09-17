import type { ExecutionContext } from '@nestjs/common'
import type { ModuleRef } from '@nestjs/core'
import { ProtectService } from '../protect.service'

export function getProtectService(
  ctx: ExecutionContext,
): ProtectService | null {
  try {
    const app = ctx.switchToHttp().getRequest().app
    if (app?.get) {
      return app.get(ProtectService)
    }

    // Fallback: try to get from module ref if available
    const moduleRef = ctx.switchToHttp().getRequest().moduleRef as ModuleRef
    if (moduleRef) {
      return moduleRef.get(ProtectService, { strict: false })
    }

    return null
  } catch (error) {
    return null
  }
}
