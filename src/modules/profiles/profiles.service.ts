import { Injectable, NotFoundException } from '@nestjs/common';
import { FollowsService } from '../follows/follows.service.js';
import { PostsReadService } from '../posts/posts-read.service.js';
import { UsersService } from '../users/users.service.js';
import { canFollow, canSeeContent } from '../visibility/visibility-rules.js';
import { VisibilityService } from '../visibility/visibility.service.js';
import type { ProfileViewDto } from './dto/profile-view.dto.js';

// Ver un perfil propio o ajeno, completo o limitado (decisión 15, HU09).
@Injectable()
export class ProfilesService {
  constructor(
    private readonly visibility: VisibilityService,
    private readonly users: UsersService,
    private readonly follows: FollowsService,
    private readonly posts: PostsReadService,
  ) {}

  async view(viewerId: string, userId: string): Promise<ProfileViewDto> {
    const facts = await this.visibility.visibleProfileFacts(viewerId, userId);
    const [profile, follows, posts] = await Promise.all([
      this.users.findProfile(userId),
      this.follows.counts(userId),
      this.posts.countByAuthor(userId),
    ]);
    if (!profile) {
      throw new NotFoundException({
        message: 'El usuario no existe',
        code: 'USER_NOT_FOUND',
      });
    }
    const full = canSeeContent(facts);
    return {
      id: userId,
      handle: profile.handle,
      displayName: profile.displayName,
      careerName: profile.careerName,
      verified: profile.verified,
      visibility: facts.visibility,
      isSelf: facts.isSelf,
      canSeeContent: full,
      followStatus: facts.followStatus ?? 'NONE',
      canFollow: canFollow(facts),
      bio: full ? profile.bio : null,
      tags: full ? profile.tags : [],
      counts: { posts: posts.count, ...follows },
    };
  }
}
