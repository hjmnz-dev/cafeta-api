import { Injectable } from '@nestjs/common';
import { MediaUrlService } from '../uploads/media-url.service.js';
import type { CurrentUser } from '../users/users.service.js';
import type { CurrentUserDto } from './dto/auth-response.dto.js';

// Bug 1072: la sesión lleva mi foto (URL firmada) y nunca la clave del blob,
// para que crear historia, publicar y comentar muestren mi avatar.
@Injectable()
export class CurrentUserPresenter {
  constructor(private readonly urls: MediaUrlService) {}

  toView(user: CurrentUser): CurrentUserDto {
    const { avatarKey, ...profile } = user.profile;
    return {
      ...user,
      profile: {
        ...profile,
        avatarUrl: avatarKey ? this.urls.urlFor(avatarKey) : null,
      },
    };
  }
}
