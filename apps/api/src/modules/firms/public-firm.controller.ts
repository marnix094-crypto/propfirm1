import { Controller, Get, Inject, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Public } from '../auth/public.decorator.js';
import { FirmsService } from './firms.service.js';
import { FirmBrandingDto, toFirmBrandingDto } from './dto.js';

@ApiTags('firms')
@Controller()
export class PublicFirmController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly firms: FirmsService,
  ) {}

  /** Branding for the platform/storefront of the requesting host or `X-Firm` slug. */
  @Public()
  @Get('public/firm')
  @ApiOkResponse({ type: FirmBrandingDto })
  async firm(@Req() req: Request): Promise<FirmBrandingDto> {
    return toFirmBrandingDto(await this.firms.fromRequest(req), this.config.defaultFirmSlug);
  }
}
