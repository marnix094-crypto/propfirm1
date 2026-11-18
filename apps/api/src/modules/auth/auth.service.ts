import { Inject, Injectable, Logger } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Errors } from '../../common/errors.js';
import { Prisma, type User } from '../../generated/prisma/client.js';
import { BLOCKED_COUNTRIES } from './restrictions.js';
import { EmailTokensService } from './email-tokens.service.js';
import { TwoFactorService } from './two-factor.service.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { renderMail } from '../mail/templates.js';
import { TokensService, type IssuedTokens } from './tokens.service.js';
import type { ChangePasswordDto, LoginDto, RegisterDto, UserDto } from './dto.js';

// argon2id, OWASP-recommended parameters.
const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };
// Used to keep login timing similar when the email does not exist.
const DUMMY_HASH = await hash('dummy-password-for-timing', ARGON);

export const toUserDto = (u: User, twoFactorEnabled: boolean): UserDto => ({
  id: u.id,
  email: u.email,
  roles: u.roles,
  locale: u.locale,
  country: u.country,
  emailVerified: u.emailVerifiedAt !== null,
  twoFactorEnabled,
});

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly emailTokens: EmailTokensService,
    private readonly twoFactor: TwoFactorService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async userDto(u: User): Promise<UserDto> {
    return toUserDto(u, await this.twoFactor.isEnabled(u.id));
  }

  /** Send (or re-send) the verification email. Failures are logged, never block the user. */
  async sendVerification(user: User): Promise<void> {
    if (user.emailVerifiedAt) return;
    const token = await this.emailTokens.issue(user.id, 'VERIFY_EMAIL');
    const link = `${this.config.appBaseUrl}/${user.locale}/verify-email?token=${token}`;
    await this.mailer
      .send({ to: user.email, ...renderMail('verify', user.locale, link) })
      .catch((e: Error) => this.logger.warn(`verification mail failed: ${e.message}`));
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.emailTokens.consume(token, 'VERIFY_EMAIL');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
      await this.audit.append(tx, {
        actorType: 'USER',
        actorId: userId,
        action: 'user.email_verified',
        entityType: 'User',
        entityId: userId,
        data: {},
      });
    });
  }

  /** Always succeeds from the caller's view (no account enumeration). */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') return;
    const token = await this.emailTokens.issue(user.id, 'RESET_PASSWORD');
    const link = `${this.config.appBaseUrl}/${user.locale}/reset-password?token=${token}`;
    await this.mailer
      .send({ to: user.email, ...renderMail('reset', user.locale, link) })
      .catch((e: Error) => this.logger.warn(`reset mail failed: ${e.message}`));
  }

  /** Sets a new password and signs out every session. */
  async resetPassword(token: string, password: string): Promise<void> {
    const userId = await this.emailTokens.consume(token, 'RESET_PASSWORD');
    const passwordHash = await hash(password, ARGON);
    await this.prisma.$transaction(async (tx) => {
      // The reset link proves control of the inbox, so the address counts as verified.
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, emailVerifiedAt: new Date() },
      });
      await this.audit.append(tx, {
        actorType: 'USER',
        actorId: userId,
        action: 'user.password_reset',
        entityType: 'User',
        entityId: userId,
        data: {},
      });
    });
    await this.tokens.revokeAll(userId);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    currentFamilyId: string | null,
  ): Promise<void> {
    const user = await this.me(userId);
    if (!(await verify(user.passwordHash, dto.currentPassword)))
      throw Errors.unprocessable('PASSWORD_INCORRECT', 'Current password is incorrect');
    if (await this.twoFactor.isEnabled(userId)) {
      if (!dto.code || !(await this.twoFactor.verify(userId, dto.code)))
        throw Errors.unprocessable('TWO_FACTOR_CODE_INVALID', 'The code is not valid');
    }
    const passwordHash = await hash(dto.newPassword, ARGON);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await this.audit.append(tx, {
        actorType: 'USER',
        actorId: userId,
        action: 'user.password_changed',
        entityType: 'User',
        entityId: userId,
        data: {},
      });
    });
    // Sign out other devices; keep the current session.
    await this.tokens.revokeAll(userId, currentFamilyId);
  }

  async checkPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.me(userId);
    return verify(user.passwordHash, password);
  }

  async register(
    dto: RegisterDto,
    userAgent?: string,
  ): Promise<{ user: User; tokens: IssuedTokens }> {
    if (BLOCKED_COUNTRIES.has(dto.country))
      throw Errors.unprocessable('COUNTRY_RESTRICTED', 'Service not available in this country');
    const passwordHash = await hash(dto.password, ARGON);
    const initial = this.config.demoInitialBalanceMinor;
    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            country: dto.country,
            locale: dto.locale,
            termsAcceptedAt: new Date(),
            termsVersion: this.config.termsVersion,
          },
        });
        // Every trader gets a free demo account with virtual funds (decision: own funds = demo only).
        const acc = await tx.tradingAccount.create({
          data: {
            userId: u.id,
            kind: 'DEMO',
            label: 'Demo',
            initialBalanceMinor: initial,
            balanceMinor: initial,
            highWaterMarkMinor: initial,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            accountId: acc.id,
            type: 'INITIAL_CAPITAL',
            amountMinor: initial,
            balanceAfterMinor: initial,
            refType: 'account',
            refId: acc.id,
          },
        });
        await this.audit.append(tx, {
          actorType: 'USER',
          actorId: u.id,
          action: 'user.registered',
          entityType: 'User',
          entityId: u.id,
          data: { country: u.country },
        });
        await this.audit.append(tx, {
          actorType: 'SYSTEM',
          action: 'account.created',
          entityType: 'TradingAccount',
          entityId: acc.id,
          data: { kind: 'DEMO', initialBalanceMinor: initial },
        });
        return u;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw Errors.conflict('EMAIL_TAKEN', 'An account with this email already exists');
      }
      throw e;
    }
    await this.sendVerification(user);
    return { user, tokens: await this.tokens.issue(user.id, user.roles, userAgent) };
  }

  async login(
    dto: LoginDto,
    userAgent?: string,
  ): Promise<{ user: User; tokens: IssuedTokens } | { mfaToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const ok = await verify(user?.passwordHash ?? DUMMY_HASH, dto.password);
    if (!user || !ok) throw Errors.unauthorized('INVALID_CREDENTIALS');
    if (user.status !== 'ACTIVE') throw Errors.forbidden('ACCOUNT_SUSPENDED');
    if (await this.twoFactor.isEnabled(user.id))
      return { mfaToken: await this.tokens.signMfa(user.id) };
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { user, tokens: await this.tokens.issue(user.id, user.roles, userAgent) };
  }

  /** Second login step. */
  async completeMfa(
    mfaToken: string,
    code: string | undefined,
    recoveryCode: string | undefined,
    userAgent?: string,
  ) {
    const userId = await this.tokens.verifyMfa(mfaToken);
    if (!(await this.twoFactor.verify(userId, code, recoveryCode)))
      throw Errors.unauthorized('TWO_FACTOR_CODE_INVALID');
    const user = await this.me(userId);
    if (user.status !== 'ACTIVE') throw Errors.forbidden('ACCOUNT_SUSPENDED');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { user, tokens: await this.tokens.issue(user.id, user.roles, userAgent) };
  }

  async me(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Errors.unauthorized();
    return user;
  }
}
