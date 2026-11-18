import { Controller, Get, HttpCode, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Errors } from '../../common/errors.js';
import { Public } from '../auth/public.decorator.js';
import { ProvisioningService } from './provisioning.service.js';

@ApiTags('provisioning')
@Controller()
export class TlsAllowController {
  constructor(private readonly provisioning: ProvisioningService) {}

  /**
   * For the TLS edge (e.g. Caddy `on_demand_tls { ask … }`): 204 when a certificate may be
   * issued for this hostname (active firm subdomain or verified own domain), otherwise 404.
   */
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('internal/tls/allow')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async allow(@Query('domain') domain?: string): Promise<void> {
    if (!domain || domain.length > 253 || !(await this.provisioning.allowCertificate(domain)))
      throw Errors.notFound('Domain');
  }
}
