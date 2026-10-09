import { Body, Controller, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actor } from '../../common/actor/actor.decorator.js';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { ProfileViewDto } from './dto/profile-view.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ProfileEditService } from './profile-edit.service.js';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('me/profile')
export class MeProfileController {
  constructor(private readonly edit: ProfileEditService) {}

  @Patch()
  update(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<ProfileViewDto> {
    return this.edit.update(user.id, dto, actor);
  }
}
