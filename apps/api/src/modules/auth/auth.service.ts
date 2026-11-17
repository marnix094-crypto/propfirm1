import { Inject, Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Errors } from '../../common/errors.js';
import { Prisma, type User } from '../../generated/prisma/client.js';
import { BLOCKED_COUNTRIES } from './restrictions.js';
import { TokensService, type IssuedTokens } from './tokens.service.js';
import type { LoginDto, RegisterDto, UserDto } from './dto.js';

// argon2id, OWASP-recommended parameters.
const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };
// Used to keep login timing similar when the email does not exist.
const DUMMY_HASH = await hash('dummy-password-for-timing', ARGON);

export const toUserDto = (u: User): UserDto => ({
  id: u.id,
  email: u.email,
  roles: u.roles,
  locale: u.locale,
  country: u.country,
});

@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
  ) {}

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
    return { user, tokens: await this.tokens.issue(user.id, user.roles, userAgent) };
  }

  async login(dto: LoginDto, userAgent?: string): Promise<{ user: User; tokens: IssuedTokens }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const ok = await verify(user?.passwordHash ?? DUMMY_HASH, dto.password);
    if (!user || !ok) throw Errors.unauthorized('INVALID_CREDENTIALS');
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
