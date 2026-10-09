import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ReportTarget } from '../../generated/prisma/client.js';
import { PostsReadService } from '../posts/posts-read.service.js';
import { VisibilityService } from '../visibility/visibility.service.js';
import { canSeeContent } from '../visibility/visibility-rules.js';
import { pendingKeyOf } from './report-keys.js';

// Lo que se guarda del objetivo ya validado.
export interface ResolvedTarget {
  targetUserId: string | null;
  targetPostId: string | null;
  // Copia del texto de la publicación al momento del reporte (spec 0002).
  targetSnapshot: string | null;
  pendingKey: string;
}

const cannotReportSelf = () =>
  new BadRequestException({
    message: 'No puedes reportarte a ti mismo ni a tu propia publicación',
    code: 'CANNOT_REPORT_SELF',
  });

const postNotFound = () =>
  new NotFoundException({
    message: 'La publicación no existe',
    code: 'POST_NOT_FOUND',
  });

// Decide si el objetivo se puede reportar: existe, no es de quien reporta y
// quien reporta lo ve (decisión 30). Todo objetivo invisible responde 404, como
// si no existiera (decisión 29).
@Injectable()
export class ReportTargetResolver {
  constructor(
    private readonly posts: PostsReadService,
    private readonly visibility: VisibilityService,
  ) {}

  resolve(
    reporterId: string,
    type: ReportTarget,
    targetId: string,
  ): Promise<ResolvedTarget> {
    return type === 'USER'
      ? this.resolveUser(reporterId, targetId)
      : this.resolvePost(reporterId, targetId);
  }

  private async resolveUser(
    reporterId: string,
    userId: string,
  ): Promise<ResolvedTarget> {
    if (userId === reporterId) throw cannotReportSelf();
    await this.visibility.visibleProfileFacts(reporterId, userId);
    return {
      targetUserId: userId,
      targetPostId: null,
      targetSnapshot: null,
      pendingKey: pendingKeyOf('USER', userId),
    };
  }

  private async resolvePost(
    reporterId: string,
    postId: string,
  ): Promise<ResolvedTarget> {
    const post = await this.posts.visibleSummary(postId);
    if (!post) throw postNotFound();
    if (post.authorId === reporterId) throw cannotReportSelf();
    // Los anuncios los ve todo el mundo, igual que en el feed.
    if (post.type !== 'ANNOUNCEMENT') {
      const facts = await this.visibility.facts(reporterId, post.authorId);
      if (!facts || !canSeeContent(facts)) throw postNotFound();
    }
    return {
      targetUserId: null,
      targetPostId: postId,
      targetSnapshot: post.content,
      pendingKey: pendingKeyOf('POST', postId),
    };
  }
}
