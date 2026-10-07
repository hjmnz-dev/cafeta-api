import { Module } from '@nestjs/common';
import { UserAccountService } from './user-account.service.js';
import { UsersService } from './users.service.js';

@Module({
  providers: [UsersService, UserAccountService],
  exports: [UsersService, UserAccountService],
})
export class UsersModule {}
