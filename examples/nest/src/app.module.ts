import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ProtectModule, schemas } from './protect'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ProtectModule.forRoot({
      schemas,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
