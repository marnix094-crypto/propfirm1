import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { FundingParams, RuleParams } from '@brand/engine';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import type { RuleSet } from '../../generated/prisma/client.js';
import { RULE_SET_CATALOG } from './catalog.js';

export function toRuleParams(r: RuleSet): RuleParams {
  return {
    maxDailyLossBps: r.maxDailyLossBps,
    dailyLossBasis: r.dailyLossBasis,
    dailyLossReference: r.dailyLossReference,
    maxDrawdownBps: r.maxDrawdownBps,
    drawdownType: r.drawdownType,
    trailingBasis: r.trailingBasis,
    trailingLocksAtInitial: r.trailingLocksAtInitial,
    profitTargetBps: r.profitTargetBps,
    minTradingDays: r.minTradingDays,
    warnRatioBps: r.warnRatioBps,
  };
}

/** Payout & scaling terms, or null when this rule set version does not define them. */
export function toFundingParams(r: RuleSet): FundingParams | null {
  if (
    r.profitSplitBps == null ||
    r.payoutIntervalDays == null ||
    r.minTradingDaysPerPayout == null ||
    r.minPayoutMinor == null ||
    r.scalingProfitTargetBps == null ||
    r.scalingMinPayouts == null ||
    r.scalingStepBps == null ||
    r.scalingMaxBalanceMinor == null
  )
    return null;
  return {
    profitSplitBps: r.profitSplitBps,
    payoutIntervalDays: r.payoutIntervalDays,
    minTradingDaysPerPayout: r.minTradingDaysPerPayout,
    minPayoutMinor: r.minPayoutMinor,
    scalingProfitTargetBps: r.scalingProfitTargetBps,
    scalingMinPayouts: r.scalingMinPayouts,
    scalingStepBps: r.scalingStepBps,
    scalingMaxBalanceMinor: r.scalingMaxBalanceMinor,
  };
}

const KEYS = Object.keys(RULE_SET_CATALOG[0]!) as (keyof (typeof RULE_SET_CATALOG)[number])[];

/** Ensures the catalogue exists in the DB; refuses to start if a stored version differs. */
@Injectable()
export class RulesService implements OnModuleInit {
  private readonly logger = new Logger(RulesService.name);
  constructor(private readonly prisma: PrismaService) {}

  private ready: Promise<void> | null = null;

  onModuleInit() {
    return this.ensureCatalog();
  }

  /** Idempotent; other modules await it before relying on catalogue rows. */
  ensureCatalog(): Promise<void> {
    this.ready ??= this.syncCatalog();
    return this.ready;
  }

  private async syncCatalog() {
    for (const def of RULE_SET_CATALOG) {
      const existing = await this.prisma.ruleSet.findUnique({
        where: { code_version: { code: def.code, version: def.version } },
      });
      if (!existing) {
        await this.prisma.ruleSet.create({ data: def });
        this.logger.log(`Created rule set ${def.code} v${def.version}`);
        continue;
      }
      const changed = KEYS.filter((k) => existing[k] !== def[k]);
      if (changed.length > 0) {
        throw new Error(
          `Rule set ${def.code} v${def.version} differs from the catalogue (${changed.join(', ')}). Add a new version instead.`,
        );
      }
    }
  }

  async latest(code: string): Promise<RuleSet> {
    const r = await this.prisma.ruleSet.findFirst({
      where: { code },
      orderBy: { version: 'desc' },
    });
    if (!r) throw Errors.notFound('RuleSet');
    return r;
  }
}
