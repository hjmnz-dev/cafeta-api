import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { ProfileViewDto } from './dto/profile-view.dto.js';
import { ProfilesService } from './profiles.service.js';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('users/:userId/profile')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  view(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProfileViewDto> {
    return this.profiles.view(user.id, userId);
  }
}
