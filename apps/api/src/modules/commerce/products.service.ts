import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { quotePriceMinor } from '@brand/engine';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import type { Product, RuleSet } from '../../generated/prisma/client.js';
import { RulesService } from '../rules/rules.service.js';
import { INSTANT_RULE_CODE_BY_DRAWDOWN } from '../rules/catalog.js';
import type { PriceQuoteDto, PriceQuoteRequestDto, ProductDto, ProductRulesDto } from './dto.js';
import { CUSTOM_SIZE, PRODUCT_CATALOG, QUOTE_TTL_MS } from './products.catalog.js';

export function toProductRulesDto(r: RuleSet): ProductRulesDto {
  return {
    maxDailyLossBps: r.maxDailyLossBps,
    maxDrawdownBps: r.maxDrawdownBps,
    drawdownType: r.drawdownType,
    profitSplitBps: r.profitSplitBps ?? 0,
    maxLeverage: r.maxLeverage,
    minTradingDays: r.minTradingDays,
    payoutIntervalDays: r.payoutIntervalDays,
    minTradingDaysPerPayout: r.minTradingDaysPerPayout,
    scalingStepBps: r.scalingStepBps,
    isExample: r.isExample,
  };
}

function toProductDto(p: Product & { ruleSet: RuleSet }): ProductDto {
  return {
    id: p.id,
    slug: p.slug,
    type: p.type,
    accountSizeMinor: p.accountSizeMinor.toString(),
    accountCurrency: 'USD',
    priceMinor: p.priceMinor.toString(),
    priceCurrency: 'EUR',
    isRecommended: p.isRecommended,
    isExample: p.isExample || p.ruleSet.isExample,
    rules: toProductRulesDto(p.ruleSet),
  };
}

@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly logger = new Logger(ProductsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
  ) {}

  /** Creates missing catalogue products. Existing rows are left alone (admin-managed later). */
  async onModuleInit() {
    await this.rules.ensureCatalog();
    for (const [i, def] of PRODUCT_CATALOG.entries()) {
      const exists = await this.prisma.product.findUnique({ where: { slug: def.slug } });
      if (exists) continue;
      const ruleSet = await this.rules.latest(def.ruleSetCode);
      await this.prisma.product
        .create({
          data: {
            slug: def.slug,
            type: 'INSTANT',
            accountSizeMinor: def.accountSizeMinor,
            priceMinor: def.priceMinor,
            ruleSetId: ruleSet.id,
            isRecommended: def.isRecommended ?? false,
            isExample: true,
            sortOrder: i,
          },
        })
        .catch((e: { code?: string }) => {
          if (e.code !== 'P2002') throw e; // created concurrently by another instance
        });
      this.logger.log(`Created product ${def.slug}`);
    }
  }

  async list(type?: ProductDto['type']): Promise<ProductDto[]> {
    const rows = await this.prisma.product.findMany({
      where: { isActive: true, ...(type ? { type } : {}) },
      include: { ruleSet: true },
      orderBy: [{ sortOrder: 'asc' }, { accountSizeMinor: 'asc' }],
    });
    return rows.map(toProductDto);
  }

  async get(id: string): Promise<ProductDto> {
    const p = await this.prisma.product.findFirst({
      where: { id, isActive: true },
      include: { ruleSet: true },
    });
    if (!p) throw Errors.notFound('Product');
    return toProductDto(p);
  }

  async getQuote(id: string): Promise<PriceQuoteDto> {
    const q = await this.prisma.priceQuote.findUnique({
      where: { id },
      include: { ruleSet: true },
    });
    if (!q) throw Errors.notFound('Quote');
    return {
      quoteId: q.id,
      priceMinor: q.priceMinor.toString(),
      priceCurrency: 'EUR',
      accountSizeMinor: q.accountSizeMinor.toString(),
      rules: toProductRulesDto(q.ruleSet),
      expiresAt: q.expiresAt.toISOString(),
    };
  }

  /** Custom account price. The server is the source of truth (D15); quotes expire. */
  async quote(dto: PriceQuoteRequestDto): Promise<PriceQuoteDto> {
    if (dto.type !== 'INSTANT')
      throw Errors.unprocessable('PRODUCT_TYPE_UNAVAILABLE', 'Only instant funding is offered');
    const size = BigInt(dto.accountSizeMinor);
    if (
      size < CUSTOM_SIZE.minMinor ||
      size > CUSTOM_SIZE.maxMinor ||
      size % CUSTOM_SIZE.stepMinor !== 0n
    )
      throw Errors.unprocessable('ACCOUNT_SIZE_INVALID', 'Account size is out of range');
    const code = INSTANT_RULE_CODE_BY_DRAWDOWN[dto.maxDrawdownBps];
    if (!code) throw Errors.unprocessable('DRAWDOWN_INVALID', 'Unsupported drawdown');
    const ruleSet = await this.rules.latest(code);
    const q = await this.prisma.priceQuote.create({
      data: {
        type: 'INSTANT',
        accountSizeMinor: size,
        maxDrawdownBps: dto.maxDrawdownBps,
        priceMinor: quotePriceMinor(size, dto.maxDrawdownBps),
        ruleSetId: ruleSet.id,
        expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
      },
    });
    return {
      quoteId: q.id,
      priceMinor: q.priceMinor.toString(),
      priceCurrency: 'EUR',
      accountSizeMinor: q.accountSizeMinor.toString(),
      rules: toProductRulesDto(ruleSet),
      expiresAt: q.expiresAt.toISOString(),
    };
  }
}
