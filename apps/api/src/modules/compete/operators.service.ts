import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { validateCompeteParams, type CompeteParams } from '@brand/engine';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Errors } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma.service.js';
import type { CompeteOperator, CompeteRound } from '../../generated/prisma/client.js';
import { requestHost } from '../firms/firms.service.js';

const CACHE_MS = 30_000;

export function paramsOf(r: CompeteOperator | CompeteRound): CompeteParams {
  const duration =
    'durationMinutes' in r ? r.durationMinutes * 60_000 : r.endsAt.getTime() - r.startsAt.getTime();
  return {
    entryFeeMinor: r.entryFeeMinor,
    startBalanceMinor: r.startBalanceMinor,
    leverage: r.leverage,
    maxDrawdownBps: r.maxDrawdownBps,
    minParticipants: r.minParticipants,
    prizePoolBps: r.prizePoolBps,
    prizeSplitBps: r.prizeSplitBps,
    durationMs: duration,
  };
}

/**
 * Operator (tenant) resolution for the compete product: `X-Compete-Operator` header (slug) →
 * request host matched to an operator domain → COMPETE_DEFAULT_OPERATOR_SLUG. Only decides
 * where a player registers / logs in; after login the operator always comes from the player.
 */
@Injectable()
export class CompeteOperatorsService {
  private readonly cache = new Map<string, { op: CompeteOperator | null; at: number }>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  private async cached(
    key: string,
    load: () => Promise<CompeteOperator | null>,
  ): Promise<CompeteOperator | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.op;
    const op = await load();
    if (this.cache.size > 1000) this.cache.clear();
    this.cache.set(key, { op, at: Date.now() });
    return op;
  }

  async defaultOperator(): Promise<CompeteOperator> {
    const slug = this.config.compete.defaultOperatorSlug;
    const op = await this.cached(`slug:${slug}`, () =>
      this.prisma.competeOperator.upsert({
        where: { slug },
        create: { slug, name: slug === 'your-arena' ? 'Your Arena' : slug },
        update: {},
      }),
    );
    return op!;
  }

  async fromRequest(req: Pick<Request, 'headers'>): Promise<CompeteOperator> {
    return (await this.resolve(req)).op;
  }

  /** Like fromRequest, plus whether the request's host itself belongs to the operator. */
  async resolve(req: Pick<Request, 'headers'>): Promise<{ op: CompeteOperator; byHost: boolean }> {
    const header = req.headers['x-compete-operator'];
    const slug = (Array.isArray(header) ? header[0] : header)?.trim().toLowerCase();
    let op: CompeteOperator | null = null;
    let byHost = false;
    if (slug) {
      op = await this.cached(`slug:${slug}`, () =>
        this.prisma.competeOperator.findUnique({ where: { slug } }),
      );
      if (!op) throw Errors.notFound('Operator');
    } else {
      const host = requestHost(req);
      if (host) op = await this.cached(`host:${host}`, () => this.byHost(host));
      byHost = op !== null;
      op ??= await this.defaultOperator();
    }
    if (op.status !== 'ACTIVE') throw Errors.forbidden('OPERATOR_SUSPENDED');
    return { op, byHost };
  }

  /**
   * Operator of a hostname (D108): `<slug>.<COMPETE_BASE_DOMAIN>` or a verified own domain.
   * An own domain that has not passed DNS verification never resolves.
   */
  async byHost(host: string): Promise<CompeteOperator | null> {
    const h = host.toLowerCase().replace(/\.$/, '');
    const base = this.config.compete.baseDomain;
    if (base && h.endsWith(`.${base}`)) {
      const slug = h.slice(0, -(base.length + 1));
      return /^[a-z0-9-]{1,40}$/.test(slug)
        ? this.prisma.competeOperator.findUnique({ where: { slug } })
        : null;
    }
    const op = await this.prisma.competeOperator.findUnique({ where: { domain: h } });
    return op?.domainStatus === 'ACTIVE' ? op : null;
  }

  async byId(id: string): Promise<CompeteOperator> {
    const op = await this.cached(`id:${id}`, () =>
      this.prisma.competeOperator.findUnique({ where: { id } }),
    );
    if (!op) throw Errors.notFound('Operator');
    return op;
  }

  /** Every operator the scheduler should create rounds for. */
  async active(): Promise<CompeteOperator[]> {
    await this.defaultOperator();
    return this.prisma.competeOperator.findMany({ where: { status: 'ACTIVE' } });
  }

  /** Defensive check: stored operator params must satisfy the engine constraints. */
  assertValid(op: CompeteOperator): void {
    const errors = validateCompeteParams(paramsOf(op));
    if (errors.length > 0) throw Errors.unprocessable('OPERATOR_PARAMS_INVALID', errors.join(', '));
  }

  invalidate(): void {
    this.cache.clear();
  }
}
