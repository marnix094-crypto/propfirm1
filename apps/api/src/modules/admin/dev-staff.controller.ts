import { randomBytes } from 'node:crypto';
import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { hash } from '@node-rs/argon2';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Errors } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { Public } from '../auth/public.decorator.js';
import { ProductsService } from '../commerce/products.service.js';
import { FirmsService } from '../firms/firms.service.js';

export class DevStaffRequestDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(12) password!: string;
  @ApiPropertyOptional({ description: 'Create a Daily Funded superadmin instead of a firm admin' })
  @IsOptional()
  @IsBoolean()
  superadmin?: boolean;
}

export class DevStaffDto {
  @ApiProperty() firmId!: string;
  @ApiProperty() slug!: string;
}

@ApiTags('config')
@Controller()
export class DevStaffController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly firms: FirmsService,
    private readonly products: ProductsService,
  ) {}

  /**
   * DEV ONLY (e2e/local): a new firm with an admin who can sign in right away, or a Daily
   * Funded superadmin. Never in production (DEV_TOOLS_ENABLED is refused there).
   */
  @Public()
  @Post('dev/staff')
  @HttpCode(201)
  @ApiCreatedResponse({ type: DevStaffDto })
  async devStaff(@Body() dto: DevStaffRequestDto): Promise<DevStaffDto> {
    if (!this.config.devToolsEnabled) throw Errors.notFound('Route');
    const suffix = randomBytes(4).toString('hex');
    const firm = dto.superadmin
      ? await this.firms.defaultFirm()
      : await this.prisma.firm.create({
          data: { slug: `dev-${suffix}`, name: `Dev Firm ${suffix}` },
        });
    if (!dto.superadmin) await this.products.seedCatalog(firm.id);
    await this.prisma.user.create({
      data: {
        firmId: firm.id,
        email: dto.email.toLowerCase(),
        passwordHash: await hash(dto.password),
        firmRole: dto.superadmin ? null : 'OWNER',
        roles: dto.superadmin ? ['ADMIN'] : ['TRADER'],
        country: 'NL',
        locale: 'en',
        emailVerifiedAt: new Date(),
        termsAcceptedAt: new Date(),
        termsVersion: 'staff',
      },
    });
    this.firms.invalidate();
    return { firmId: firm.id, slug: firm.slug };
  }
}
