import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { Actor } from '../../common/actor/actor.decorator.js';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { PasswordResetService } from './password-reset.service.js';

@ApiTags('auth')
@Controller('auth')
export class PasswordResetController {
  constructor(private readonly passwordReset: PasswordResetService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ auth: true, posts: true })
  @Post('forgot-password')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Pide un enlace por correo para restablecer la contraseña',
    description:
      'Responde igual exista o no la cuenta. El límite es de 3 pedidos por hora por IP.',
  })
  @ApiNoContentResponse({ description: 'Si la cuenta existe, el correo salió' })
  @ApiTooManyRequestsResponse({ description: 'Más de 3 pedidos en una hora' })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.passwordReset.request(dto.email);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ reset: true, posts: true })
  @Post('reset-password')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Pone una contraseña nueva con el token del correo',
    description:
      'El token sirve una sola vez y dura 30 minutos. Al usarlo se cierran todas las sesiones.',
  })
  @ApiNoContentResponse({ description: 'La contraseña cambió' })
  @ApiBadRequestResponse({
    description: 'RESET_TOKEN_INVALID (venció, ya se usó o no existe)',
  })
  resetPassword(
    @Body() dto: ResetPasswordDto,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.passwordReset.reset(dto.token, dto.password, actor);
  }
}
