import { Module } from '@nestjs/common';
import { ProfileUpdater } from './profile-updater.service.js';
import { UsersService } from './users.service.js';

@Module({
  providers: [UsersService, ProfileUpdater],
  exports: [UsersService, ProfileUpdater],
})
export class UsersModule {}
