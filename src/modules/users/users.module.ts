import { Module } from '@nestjs/common';
import { CredentialsService } from './credentials.service.js';
import { UserAccountService } from './user-account.service.js';
import { UsersService } from './users.service.js';

@Module({
  providers: [UsersService, UserAccountService, CredentialsService],
  exports: [UsersService, UserAccountService, CredentialsService],
})
export class UsersModule {}
