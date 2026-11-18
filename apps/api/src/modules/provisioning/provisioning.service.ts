import { randomBytes } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma.service.js';
import type {
  Firm,
  ProvisioningStatus,
  ProvisioningStep,
  ProvisioningStepKey,
} from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { ProductsService } from '../commerce/products.service.js';
import { FirmsService } from '../firms/firms.service.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../security/field-crypto.js';
import { DATABASE_PROVISIONER, type DatabaseProvisioner } from './database-provisioner.js';
import { DNS_RESOLVER, type DnsResolver } from './dns-resolver.js';

/** Steps in execution order (D93). */
export const PROVISIONING_STEPS: ProvisioningStepKey[] = [
  'TENANT',
  'ADMIN',
  'DATABASE',
  'SUBDOMAIN',
  'CUSTOM_DOMAIN',
];
const RETRY_MS = 60_000;
const MAX_FAILED_ATTEMPTS = 10;
/** TXT record a firm publishes to prove it controls its own domain. */
export const VERIFY_PREFIX = '_dailyfunded-verify';

type StepResult = { status: ProvisioningStatus; detail: string | null };

export interface DomainSetup {
  domain: string | null;
  status: Firm['domainStatus'];
  subdomain: string | null;
  cnameTarget: string | null;
  txtName: string | null;
  txtValue: string | null;
  checkedAt: string | null;
}

/**
 * Automatic set-up of a new firm (D93–D95): tenant data, admin, database (shared or
 * dedicated), subdomain and own domain. Every step is idempotent; failed and waiting steps
 * are retried in the background, so a firm completes on its own once DNS is in place.
 */
@Injectable()
export class ProvisioningService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProvisioningService.name);
  private timer?: NodeJS.Timeout;
  private readonly running = new Set<string>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly products: ProductsService,
    private readonly firms: FirmsService,
    @Inject(DNS_RESOLVER) private readonly dns: DnsResolver,
    @Inject(DATABASE_PROVISIONER) private readonly databases: DatabaseProvisioner,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
  ) {}

  onModuleInit() {
    if (this.config.env !== 'test')
      this.timer = setInterval(() => void this.retryPending(), RETRY_MS);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  get dedicatedAvailable(): boolean {
    return this.databases.available;
  }

  subdomainOf(firm: Pick<Firm, 'slug'>): string | null {
    return this.config.platformBaseDomain ? `${firm.slug}.${this.config.platformBaseDomain}` : null;
  }

  domainSetup(firm: Firm): DomainSetup {
    return {
      domain: firm.domain,
      status: firm.domainStatus,
      subdomain: this.subdomainOf(firm),
      cnameTarget: this.config.platformCnameTarget,
      txtName: firm.domain ? `${VERIFY_PREFIX}.${firm.domain}` : null,
      txtValue: firm.domainToken,
      checkedAt: firm.domainCheckedAt?.toISOString() ?? null,
    };
  }

  // ---------------------------------------------------------------- pipeline
  /** Creates the step rows for a new firm and runs the pipeline. */
  async start(firmId: string): Promise<void> {
    await this.prisma.provisioningStep.createMany({
      data: PROVISIONING_STEPS.map((step) => ({ firmId, step })),
      skipDuplicates: true,
    });
    await this.run(firmId);
  }

  /** Runs every step that is not finished yet, in order. One run per firm at a time. */
  async run(firmId: string): Promise<ProvisioningStep[]> {
    if (!this.running.has(firmId)) {
      this.running.add(firmId);
      try {
        for (const key of PROVISIONING_STEPS) {
          const step = await this.prisma.provisioningStep.upsert({
            where: { firmId_step: { firmId, step: key } },
            create: { firmId, step: key },
            update: {},
          });
          if (step.status === 'DONE' || step.status === 'SKIPPED') continue;
          await this.prisma.provisioningStep.update({
            where: { id: step.id },
            data: { status: 'RUNNING', attempts: { increment: 1 } },
          });
          let result: StepResult;
          try {
            result = await this.execute(firmId, key);
          } catch (e) {
            const code = e instanceof Error && /^[A-Z_0-9]+$/.test(e.message) ? e.message : 'ERROR';
            this.logger.warn(`Provisioning ${key} for ${firmId} failed: ${(e as Error).message}`);
            result = { status: 'FAILED', detail: code };
          }
          await this.prisma.provisioningStep.update({
            where: { id: step.id },
            data: { status: result.status, detail: result.detail },
          });
          if (result.status === 'DONE')
            await this.prisma.$transaction((tx) =>
              this.audit.append(tx, {
                actorType: 'SYSTEM',
                firmId,
                action: 'platform.provisioning_step_done',
                entityType: 'Firm',
                entityId: firmId,
                data: { step: key, detail: result.detail },
              }),
            );
        }
      } finally {
        this.running.delete(firmId);
        this.firms.invalidate();
      }
    }
    return this.steps(firmId);
  }

  steps(firmId: string): Promise<ProvisioningStep[]> {
    return this.prisma.provisioningStep
      .findMany({ where: { firmId } })
      .then((rows) =>
        rows.sort((a, b) => PROVISIONING_STEPS.indexOf(a.step) - PROVISIONING_STEPS.indexOf(b.step)),
      );
  }

  /** Background: waiting (DNS) and failed steps are retried until they succeed. */
  async retryPending(): Promise<void> {
    const rows = await this.prisma.provisioningStep.findMany({
      where: {
        OR: [
          { status: 'WAITING' },
          { status: 'PENDING' },
          { status: 'FAILED', attempts: { lt: MAX_FAILED_ATTEMPTS } },
        ],
      },
      select: { firmId: true },
      distinct: ['firmId'],
      take: 50,
    });
    for (const r of rows) await this.run(r.firmId).catch(() => undefined);
  }

  private async execute(firmId: string, key: ProvisioningStepKey): Promise<StepResult> {
    const firm = await this.prisma.firm.findUniqueOrThrow({ where: { id: firmId } });
    switch (key) {
      case 'TENANT':
        await this.products.seedCatalog(firmId);
        return { status: 'DONE', detail: 'CATALOGUE_READY' };
      case 'ADMIN': {
        if (firm.slug === this.config.defaultFirmSlug)
          return { status: 'SKIPPED', detail: 'PLATFORM_FIRM' };
        const admin = await this.prisma.user.count({
          where: { firmId, firmRole: 'OWNER', status: 'ACTIVE' },
        });
        return admin > 0
          ? { status: 'DONE', detail: 'ADMIN_INVITED' }
          : { status: 'WAITING', detail: 'NO_ADMIN' };
      }
      case 'DATABASE': {
        if (!firm.dedicatedDatabase) return { status: 'DONE', detail: 'SHARED' };
        if (firm.databaseUrlEnc) return { status: 'DONE', detail: 'DEDICATED_READY' };
        if (!this.databases.available) return { status: 'FAILED', detail: 'PROVISIONER_UNAVAILABLE' };
        const db = await this.databases.create(firm);
        await this.prisma.firm.update({
          where: { id: firmId },
          data: { databaseUrlEnc: this.crypto.encrypt(db.databaseUrl) },
        });
        return { status: 'DONE', detail: 'DEDICATED_READY' };
      }
      case 'SUBDOMAIN':
        // A wildcard DNS record (*.<base>) points every firm subdomain at the platform.
        return this.config.platformBaseDomain
          ? { status: 'DONE', detail: 'ACTIVE' }
          : { status: 'SKIPPED', detail: 'NO_BASE_DOMAIN' };
      case 'CUSTOM_DOMAIN':
        return this.verifyDomain(firm);
    }
  }

  // ---------------------------------------------------------------- own domain
  /** Sets (or removes) the firm's own domain: a new token, verification starts again. */
  async setDomain(firmId: string, domain: string | null): Promise<void> {
    await this.prisma.firm.update({
      where: { id: firmId },
      data: domain
        ? {
            domain,
            domainStatus: 'PENDING_DNS',
            domainToken: randomBytes(16).toString('hex'),
            domainCheckedAt: null,
          }
        : { domain: null, domainStatus: 'NONE', domainToken: null, domainCheckedAt: null },
    });
    await this.prisma.provisioningStep.upsert({
      where: { firmId_step: { firmId, step: 'CUSTOM_DOMAIN' } },
      create: { firmId, step: 'CUSTOM_DOMAIN' },
      update: { status: 'PENDING', detail: null, attempts: 0 },
    });
    this.firms.invalidate();
    await this.run(firmId);
  }

  /**
   * Own domain is ACTIVE once the TXT record carries the firm's token and (when a target is
   * configured) the domain CNAMEs to the platform. Until then it routes no traffic (D95).
   */
  private async verifyDomain(firm: Firm): Promise<StepResult> {
    if (!firm.domain) return { status: 'SKIPPED', detail: 'NO_DOMAIN' };
    if (firm.domainStatus === 'ACTIVE') return { status: 'DONE', detail: 'ACTIVE' };
    const txt = await this.dns.txt(`${VERIFY_PREFIX}.${firm.domain}`);
    const target = this.config.platformCnameTarget;
    const cname = target ? await this.dns.cname(firm.domain) : [];
    const txtOk = !!firm.domainToken && txt.includes(firm.domainToken);
    const cnameOk = !target || cname.includes(target);
    const ok = txtOk && cnameOk;
    await this.prisma.firm.update({
      where: { id: firm.id },
      data: { domainCheckedAt: new Date(), ...(ok ? { domainStatus: 'ACTIVE' } : {}) },
    });
    if (ok) return { status: 'DONE', detail: 'ACTIVE' };
    return { status: 'WAITING', detail: !txtOk ? 'TXT_MISSING' : 'CNAME_MISSING' };
  }

  // ---------------------------------------------------------------- TLS
  /**
   * May the edge (e.g. Caddy on-demand TLS) request a certificate for this host? Only for an
   * active firm's subdomain or verified own domain — never for arbitrary hostnames.
   */
  async allowCertificate(host: string): Promise<boolean> {
    const h = host.toLowerCase().replace(/\.$/, '');
    const base = this.config.platformBaseDomain;
    if (base && h.endsWith(`.${base}`)) {
      const slug = h.slice(0, -(base.length + 1));
      if (!/^[a-z0-9-]+$/.test(slug)) return false;
      const f = await this.prisma.firm.findUnique({ where: { slug }, select: { status: true } });
      return f?.status === 'ACTIVE';
    }
    const f = await this.prisma.firm.findUnique({
      where: { domain: h },
      select: { status: true, domainStatus: true },
    });
    return f?.status === 'ACTIVE' && f.domainStatus === 'ACTIVE';
  }
}
