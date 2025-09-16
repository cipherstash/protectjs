import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ProtectService } from './protect/protect.service'

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, ProtectService],
})
export class AppModule {}
