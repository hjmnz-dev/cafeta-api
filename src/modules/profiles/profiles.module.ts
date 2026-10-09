import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { CareersModule } from '../careers/careers.module.js';
import { FollowsModule } from '../follows/follows.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PostsModule } from '../posts/posts.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { UsersModule } from '../users/users.module.js';
import { VisibilityModule } from '../visibility/visibility.module.js';
import { MeProfileController } from './me-profile.controller.js';
import { PrivacyController } from './privacy.controller.js';
import { PrivacyService } from './privacy.service.js';
import { ProfileEditService } from './profile-edit.service.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

// Perfiles y privacidad (decisión 15; la 14 suma editar el perfil).
@Module({
  imports: [
    AuditModule,
    CareersModule,
    UploadsModule,
    UsersModule,
    FollowsModule,
    NotificationsModule,
    PostsModule,
    VisibilityModule,
  ],
  controllers: [ProfilesController, PrivacyController, MeProfileController],
  providers: [ProfilesService, PrivacyService, ProfileEditService],
})
export class ProfilesModule {}
