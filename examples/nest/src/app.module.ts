import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { EncryptionModule, schemas } from './encryption'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EncryptionModule.forRoot({
      schemas,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
