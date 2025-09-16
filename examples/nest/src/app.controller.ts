import { Controller, Get } from '@nestjs/common'
// biome-ignore lint/style/useImportType: Required for NestJS
import { AppService, type User } from './app.service'
import type { Decrypted } from '@cipherstash/protect'

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  async getHello(): Promise<string> {
    const payload = await this.appService.getHello()
    return JSON.stringify(payload, null, 2)
  }
}
