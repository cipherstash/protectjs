import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import type { AppService } from './app.service'
import type { CreateUserDto, User } from './app.service'

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  async getHello() {
    return await this.appService.getHello()
  }

  @Post('users')
  async createUser(@Body() userData: CreateUserDto): Promise<User> {
    const u = await this.appService.createUser(userData)
    return u
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string, @Body() encryptedUser: User) {
    return await this.appService.getUser(id, encryptedUser)
  }

  @Get('users')
  async getUsers() {
    // This would typically fetch from a database
    // For demo purposes, return empty array
    return []
  }
}
