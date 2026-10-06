import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { FollowsModule } from '../follows/follows.module.js';
import { PostsModule } from '../posts/posts.module.js';
import { UsersModule } from '../users/users.module.js';
import { VisibilityModule } from '../visibility/visibility.module.js';
import { PrivacyController } from './privacy.controller.js';
import { PrivacyService } from './privacy.service.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

// Perfiles y privacidad (decisión 15; la funcionalidad 14 suma editar).
@Module({
  imports: [
    AuditModule,
    UsersModule,
    FollowsModule,
    PostsModule,
    VisibilityModule,
  ],
  controllers: [ProfilesController, PrivacyController],
  providers: [ProfilesService, PrivacyService],
})
export class ProfilesModule {}
