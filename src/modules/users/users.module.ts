import { Module } from '@nestjs/common';
import { CredentialsService } from './credentials.service.js';
import { ProfileUpdater } from './profile-updater.service.js';
import { UserAccountService } from './user-account.service.js';
import { UsersService } from './users.service.js';

@Module({
  providers: [
    UsersService,
    UserAccountService,
    CredentialsService,
    ProfileUpdater,
  ],
  exports: [
    UsersService,
    UserAccountService,
    CredentialsService,
    ProfileUpdater,
  ],
})
export class UsersModule {}
