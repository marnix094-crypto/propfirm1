import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { TokensService } from './tokens.service.js';
import { EmailTokensService } from './email-tokens.service.js';
import { TwoFactorService } from './two-factor.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    EmailTokensService,
    TwoFactorService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [TokensService],
})
export class AuthModule {}
