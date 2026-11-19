import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Errors } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { DNS_RESOLVER, type DnsResolver } from '../../infra/dns.js';
import { EdgeRegistry, type EdgeResolver, type EdgeRoute } from '../../infra/edge-registry.js';
import { Prisma, type CompeteOperator } from '../../generated/prisma/client.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../security/field-crypto.js';
import { CompeteAuditService } from './compete-audit.service.js';
import { CompeteOperatorsService } from './operators.service.js';
import type { StaffCtx } from './admin/staff-auth.js';
import type {
  CompeteAdminIntegrationDto,
  CompeteAdminSsoSecretDto,
  UpdateCompeteIntegrationDto,
} from './admin/dto.js';

/** TXT record an operator publishes to prove it controls its own domain (same scheme as D95). */
export const COMPETE_VERIFY_PREFIX = '_dailyfunded-verify';
/** Logo limit: data URL of PNG / SVG / WebP / JPEG, ≤ 200 kB. */
const LOGO_RE = /^data:image\/(png|svg\+xml|webp|jpeg);base64,[A-Za-z0-9+/=]+$/;
const LOGO_MAX = 200_000;

/**
 * Integration of a Compete operator into its own website (D108/D109): automatic subdomain,
 * own domain after DNS verification, embeddable widgets (allowed origins) and SSO secret.
 * Registers as edge resolver so `/internal/route` + `/internal/tls/allow` know its hosts.
 */
@Injectable()
export class CompeteIntegrationService implements EdgeResolver {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly operators: CompeteOperatorsService,
    private readonly audit: CompeteAuditService,
    @Inject(DNS_RESOLVER) private readonly dns: DnsResolver,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    edge: EdgeRegistry,
  ) {
    edge.register(this);
  }

  // ------------------------------------------------------------------ edge

  async route(host: string): Promise<EdgeRoute | null> {
    const op = await this.operators.byHost(host);
    if (!op || op.status !== 'ACTIVE') return null;
    return {
      product: 'compete',
      operator: op.slug,
      instance: 'shared',
      frameAncestors: op.widgetOrigins,
    };
  }

  async allowCertificate(host: string): Promise<boolean> {
    const op = await this.operators.byHost(host);
    return op?.status === 'ACTIVE';
  }

  // ------------------------------------------------------------------ admin

  subdomain(op: Pick<CompeteOperator, 'slug'>): string | null {
    const base = this.config.compete.baseDomain;
    return base ? `${op.slug}.${base}` : null;
  }

  async get(operatorId: string): Promise<CompeteAdminIntegrationDto> {
    const op = await this.prisma.competeOperator.findUniqueOrThrow({ where: { id: operatorId } });
    const sub = this.subdomain(op);
    return {
      slug: op.slug,
      subdomain: sub,
      domain: op.domain,
      domainStatus: op.domainStatus,
      domainCheckedAt: op.domainCheckedAt?.toISOString() ?? null,
      dnsRecords: op.domain
        ? [
            {
              type: 'TXT',
              name: `${COMPETE_VERIFY_PREFIX}.${op.domain}`,
              value: op.domainToken ?? '',
            },
            ...(this.config.platformCnameTarget
              ? [{ type: 'CNAME', name: op.domain, value: this.config.platformCnameTarget }]
              : []),
          ]
        : [],
      playUrl:
        op.domain && op.domainStatus === 'ACTIVE'
          ? `https://${op.domain}`
          : sub
            ? `https://${sub}`
            : null,
      logoDataUrl: op.logoDataUrl,
      widgetOrigins: op.widgetOrigins,
      ssoEnabled: op.ssoEnabled,
      ssoConfigured: !!op.ssoSecretEnc,
    };
  }

  async update(staff: StaffCtx, operatorId: string, dto: UpdateCompeteIntegrationDto) {
    const op = await this.prisma.competeOperator.findUniqueOrThrow({ where: { id: operatorId } });
    if (dto.logoDataUrl && (dto.logoDataUrl.length > LOGO_MAX || !LOGO_RE.test(dto.logoDataUrl)))
      throw Errors.unprocessable('LOGO_INVALID', 'Logo must be a PNG, SVG, WebP or JPEG ≤ 200 kB');
    const domain = dto.domain?.trim().toLowerCase() || null;
    const base = this.config.compete.baseDomain;
    if (domain && base && (domain === base || domain.endsWith(`.${base}`)))
      throw Errors.unprocessable('DOMAIN_INVALID', 'Use your own domain, not the platform domain');
    const origins = [...new Set(dto.widgetOrigins.map((o) => o.replace(/\/$/, '').toLowerCase()))];
    if (dto.ssoEnabled && !op.ssoSecretEnc)
      throw Errors.unprocessable('SSO_SECRET_MISSING', 'Generate an SSO secret first');
    const domainChanged = domain !== op.domain;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.competeOperator.update({
          where: { id: operatorId },
          data: {
            logoDataUrl: dto.logoDataUrl || null,
            widgetOrigins: origins,
            ssoEnabled: dto.ssoEnabled,
            ...(domainChanged
              ? domain
                ? {
                    domain,
                    domainStatus: 'PENDING_DNS' as const,
                    domainToken: randomBytes(16).toString('hex'),
                    domainCheckedAt: null,
                  }
                : {
                    domain: null,
                    domainStatus: 'NONE' as const,
                    domainToken: null,
                    domainCheckedAt: null,
                  }
              : {}),
          },
        });
        await this.audit.append(tx, {
          actorType: 'ADMIN',
          actorId: staff.id,
          operatorId,
          action: 'compete.operator.integration_updated',
          entityType: 'CompeteOperator',
          entityId: operatorId,
          data: {
            domain,
            domainChanged,
            widgetOrigins: origins,
            ssoEnabled: dto.ssoEnabled,
            logo: !!dto.logoDataUrl,
          },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw Errors.conflict('DOMAIN_TAKEN', 'This domain is already in use');
      throw e;
    }
    this.operators.invalidate();
    if (domainChanged && domain) await this.verifyDomain(operatorId);
    return this.get(operatorId);
  }

  /** ACTIVE once the TXT record carries the token and (if configured) the CNAME points to us. */
  async verifyDomain(operatorId: string): Promise<CompeteAdminIntegrationDto> {
    const op = await this.prisma.competeOperator.findUniqueOrThrow({ where: { id: operatorId } });
    if (!op.domain) throw Errors.unprocessable('NO_DOMAIN', 'Set a domain first');
    if (op.domainStatus !== 'ACTIVE') {
      const txt = await this.dns.txt(`${COMPETE_VERIFY_PREFIX}.${op.domain}`);
      const target = this.config.platformCnameTarget;
      const cname = target ? await this.dns.cname(op.domain) : [];
      const ok =
        !!op.domainToken && txt.includes(op.domainToken) && (!target || cname.includes(target));
      await this.prisma.$transaction(async (tx) => {
        await tx.competeOperator.update({
          where: { id: op.id },
          data: { domainCheckedAt: new Date(), ...(ok ? { domainStatus: 'ACTIVE' } : {}) },
        });
        if (ok)
          await this.audit.append(tx, {
            actorType: 'SYSTEM',
            actorId: null,
            operatorId,
            action: 'compete.operator.domain_verified',
            entityType: 'CompeteOperator',
            entityId: op.id,
            data: { domain: op.domain },
          });
      });
      this.operators.invalidate();
    }
    return this.get(operatorId);
  }

  /** New SSO secret (shown once); existing SSO tokens signed with the old one stop working. */
  async rotateSsoSecret(staff: StaffCtx, operatorId: string): Promise<CompeteAdminSsoSecretDto> {
    const secret = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      await tx.competeOperator.update({
        where: { id: operatorId },
        data: { ssoSecretEnc: this.crypto.encrypt(secret) },
      });
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId: staff.id,
        operatorId,
        action: 'compete.operator.sso_secret_rotated',
        entityType: 'CompeteOperator',
        entityId: operatorId,
        data: {},
      });
    });
    this.operators.invalidate();
    return { secret };
  }

  ssoSecret(op: CompeteOperator): Uint8Array | null {
    if (!op.ssoEnabled || !op.ssoSecretEnc) return null;
    return new TextEncoder().encode(this.crypto.decrypt(op.ssoSecretEnc));
  }
}
