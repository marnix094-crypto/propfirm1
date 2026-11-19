import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { AppError, Errors } from '../../common/errors.js';
import type { Firm } from '../../generated/prisma/client.js';

const CACHE_MS = 30_000;

/** Lower-cased hostname without port, e.g. "trade.acme.com". */
export function requestHost(req: Pick<Request, 'headers'>): string | null {
  const raw = req.headers['x-forwarded-host'] ?? req.headers.host;
  const first = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim();
  if (!first) return null;
  return first.replace(/:\d+$/, '').toLowerCase();
}

/**
 * Tenant resolution (D83). Which firm a public request belongs to is NOT an auth boundary —
 * it only decides where a trader registers / logs in and whose catalogue is shown. After login
 * the firm always comes from the user row.
 *
 * Order: `X-Firm` header (slug) → firm subdomain → verified own domain → DEFAULT_FIRM_SLUG.
 */
@Injectable()
export class FirmsService implements OnModuleInit {
  private readonly bySlug = new Map<string, { firm: Firm; at: number }>();
  private readonly byDomain = new Map<string, { firm: Firm | null; at: number }>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.defaultFirm();
  }

  /** The default tenant; created on first boot when DEFAULT_FIRM_SLUG is not the seeded one. */
  async defaultFirm(): Promise<Firm> {
    const slug = this.config.defaultFirmSlug;
    const hit = this.bySlug.get(slug);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.firm;
    const firm = await this.prisma.firm.upsert({
      where: { slug },
      create: { slug, name: slug === 'daily-funded' ? 'Daily Funded' : slug },
      update: {},
    });
    this.bySlug.set(slug, { firm, at: Date.now() });
    return firm;
  }

  async findBySlug(slug: string): Promise<Firm | null> {
    const hit = this.bySlug.get(slug);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.firm;
    const firm = await this.prisma.firm.findUnique({ where: { slug } });
    if (firm) this.bySlug.set(slug, { firm, at: Date.now() });
    return firm;
  }

  private async findByDomain(host: string): Promise<Firm | null> {
    const hit = this.byDomain.get(host);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.firm;
    // Only a verified own domain routes traffic to a firm (D95).
    const found = await this.prisma.firm.findUnique({ where: { domain: host } });
    const firm = found?.domainStatus === 'ACTIVE' ? found : null;
    this.byDomain.set(host, { firm, at: Date.now() });
    return firm;
  }

  /** Firm for a public request. Unknown `X-Firm` slugs are rejected rather than defaulted. */
  private async resolve(req: Pick<Request, 'headers'>): Promise<Firm> {
    const header = req.headers['x-firm'];
    const slug = (Array.isArray(header) ? header[0] : header)?.trim().toLowerCase();
    if (slug) {
      const firm = await this.findBySlug(slug);
      if (!firm) throw Errors.notFound('Firm');
      return firm;
    }
    const host = requestHost(req);
    if (host) {
      // Automatic subdomain: <slug>.<PLATFORM_BASE_DOMAIN> (D95).
      const base = this.config.platformBaseDomain;
      if (base && host.endsWith(`.${base}`)) {
        const firm = await this.findBySlug(host.slice(0, -(base.length + 1)));
        if (firm) return firm;
      }
      const firm = await this.findByDomain(host);
      if (firm) return firm;
    }
    return this.defaultFirm();
  }
  /**
   * Firm for a public request. On the shared platform a firm with its own instance (D94) is
   * refused: its traders are served by that instance only (the edge routes its hosts there).
   */
  async fromRequest(req: Pick<Request, 'headers'>): Promise<Firm> {
    const firm = await this.resolve(req);
    if (this.config.instanceMode === 'shared' && firm.dedicatedDatabase)
      throw new AppError('FIRM_HOSTED_ELSEWHERE', 421, 'This firm runs on its own instance');
    return firm;
  }

  /** Same as fromRequest, but refuses suspended firms (registration, login, checkout). */
  async activeFromRequest(req: Pick<Request, 'headers'>): Promise<Firm> {
    const firm = await this.fromRequest(req);
    if (firm.status !== 'ACTIVE') throw Errors.forbidden('FIRM_SUSPENDED');
    return firm;
  }

  private readonly byUser = new Map<string, { firm: Firm | null; at: number }>();

  /** Firm of a signed-in user (cached briefly; used per request by ModuleGuard). */
  async ofUser(userId: string): Promise<Firm | null> {
    const hit = this.byUser.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.firm;
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firm: true },
    });
    const firm = u?.firm ?? null;
    if (this.byUser.size > 10_000) this.byUser.clear();
    this.byUser.set(userId, { firm, at: Date.now() });
    return firm;
  }

  /** Drop cached rows after an admin change (branding, domain, status). */
  invalidate(): void {
    this.bySlug.clear();
    this.byDomain.clear();
    this.byUser.clear();
  }
}
