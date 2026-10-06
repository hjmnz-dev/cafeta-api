import { Module } from '@nestjs/common';
import { FollowsService } from './follows.service.js';

// Seguimientos (decisión 16).
@Module({
  providers: [FollowsService],
  exports: [FollowsService],
})
export class FollowsModule {}
