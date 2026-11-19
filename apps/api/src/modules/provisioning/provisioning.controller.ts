import { Controller, Get, Headers, HttpCode, Inject, Query } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import {
  ApiExcludeController,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Errors } from '../../common/errors.js';
import { Public } from '../auth/public.decorator.js';
import { ProvisioningService } from './provisioning.service.js';

/** Constant-time comparison of the X-Internal-Token header (when a token is configured). */
function tokenOk(expected: string | null, given: string | undefined): boolean {
  if (!expected) return true;
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Internal endpoints for the (hosting-agnostic) edge proxy: TLS allow-list and routing (D95). */
@ApiTags('provisioning')
@ApiExcludeController()
@Controller()
export class TlsAllowController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly provisioning: ProvisioningService,
  ) {}

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
  async allow(
    @Query('domain') domain?: string,
    @Headers('x-internal-token') token?: string,
  ): Promise<void> {
    if (!tokenOk(this.config.internalApiToken, token)) throw Errors.unauthorized();
    if (!domain || domain.length > 253 || !(await this.provisioning.allowCertificate(domain)))
      throw Errors.notFound('Domain');
  }

  /** Which instance serves a hostname: `{ firm, instance: shared | dedicated }`, else 404. */
  @Public()
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Get('internal/route')
  async route(@Query('host') host?: string, @Headers('x-internal-token') token?: string) {
    if (!tokenOk(this.config.internalApiToken, token)) throw Errors.unauthorized();
    const r = host && host.length <= 253 ? await this.provisioning.route(host) : null;
    if (!r) throw Errors.notFound('Host');
    return r;
  }
}
