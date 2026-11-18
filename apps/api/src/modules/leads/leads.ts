import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  Module,
  Post,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Equals, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { Public } from '../auth/public.decorator.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../security/field-crypto.js';

export const VOLUMES = ['lt100', '100-1000', '1000-10000', 'gt10000', 'unknown'] as const;

export class CreateLeadDto {
  @ApiProperty({ maxLength: 120 }) @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty({ maxLength: 120 }) @IsString() @MinLength(2) @MaxLength(120) company!: string;
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
  @ApiPropertyOptional({ enum: VOLUMES }) @IsOptional() @IsIn(VOLUMES) volume?: string;
  @ApiProperty({ enum: ['en', 'nl', 'es'] }) @IsIn(['en', 'nl', 'es']) locale!: string;
  @ApiProperty({ description: 'Consent to be contacted (privacy policy)' })
  @Equals(true)
  consent!: true;
  /** Honeypot: must stay empty (bots fill every field). */
  @ApiPropertyOptional({ description: 'Leave empty' })
  @IsOptional()
  @IsString()
  @MaxLength(0)
  fax?: string;
}

/** Demo requests: stored encrypted, optionally forwarded to the sales inbox. */
@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(dto: CreateLeadDto): Promise<void> {
    const enc = (v: string | undefined) => (v?.trim() ? this.crypto.encrypt(v.trim()) : null);
    const lead = await this.prisma.lead.create({
      data: {
        nameEnc: enc(dto.name)!,
        emailEnc: enc(dto.email.toLowerCase())!,
        companyEnc: enc(dto.company)!,
        websiteEnc: enc(dto.website),
        messageEnc: enc(dto.message),
        volume: dto.volume ?? null,
        locale: dto.locale,
        consentAt: new Date(),
      },
    });
    if (this.config.salesEmail) {
      await this.mailer
        .send({
          to: this.config.salesEmail,
          subject: `Demo request: ${dto.company}`,
          text: [
            `Company: ${dto.company}`,
            `Name: ${dto.name}`,
            `Email: ${dto.email}`,
            `Website: ${dto.website ?? '-'}`,
            `Traders/month: ${dto.volume ?? '-'}`,
            `Language: ${dto.locale}`,
            '',
            dto.message ?? '',
            '',
            `Lead id: ${lead.id}`,
          ].join('\n'),
        })
        .catch((e) => this.logger.error('Could not send lead notification', e as Error));
    }
  }
}

@ApiTags('public')
@Controller('public/leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Public()
  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiNoContentResponse()
  create(@Body() dto: CreateLeadDto) {
    return this.leads.create(dto);
  }
}

@Module({ controllers: [LeadsController], providers: [LeadsService] })
export class LeadsModule {}
