import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { Actor } from '../../common/actor/actor.decorator.js';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { AuthService } from './auth.service.js';
import { AuthResponseDto, CurrentUserDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ posts: true, reset: true, comments: true })
  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Actor() actor: ActorContext,
  ): Promise<AuthResponseDto> {
    return this.auth.register(dto, actor);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ posts: true, reset: true, comments: true })
  @Post('login')
  @HttpCode(200)
  login(
    @Body() dto: LoginDto,
    @Actor() actor: ActorContext,
  ): Promise<AuthResponseDto> {
    return this.auth.login(dto, actor);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(204)
  logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.auth.logout(user.sessionId);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<CurrentUserDto> {
    return this.auth.me(user.id);
  }
}
