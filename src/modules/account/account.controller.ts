import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { Actor } from '../../common/actor/actor.decorator.js';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { DeactivateAccountDto } from './dto/deactivate-account.dto.js';
import { SelfDeactivationService } from './self-deactivation.service.js';

@ApiTags('account')
@ApiBearerAuth()
@Controller('me')
export class AccountController {
  constructor(private readonly selfDeactivation: SelfDeactivationService) {}

  // Pide la contraseña, así que lleva el mismo límite de intentos que el login.
  // Apaga los otros dos: `posts` y `reset` (el de pedir el enlace, spec 0008).
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ posts: true, reset: true })
  @Post('deactivate')
  @HttpCode(204)
  deactivate(
    @Body() dto: DeactivateAccountDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.selfDeactivation.deactivate(user, dto.password, actor);
  }
}
