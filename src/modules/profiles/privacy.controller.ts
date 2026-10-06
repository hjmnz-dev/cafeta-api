import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actor } from '../../common/actor/actor.decorator.js';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { PrivacyDto, UpdatePrivacyDto } from './dto/privacy.dto.js';
import { PrivacyService } from './privacy.service.js';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('me/privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<PrivacyDto> {
    return this.privacy.get(user.id);
  }

  @Patch()
  update(
    @Body() dto: UpdatePrivacyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<PrivacyDto> {
    return this.privacy.update(user.id, dto, actor);
  }
}
