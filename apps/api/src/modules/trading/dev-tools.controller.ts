import { Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Errors } from '../../common/errors.js';
import { Public } from '../auth/public.decorator.js';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator.js';
import { RulesService } from '../rules/rules.service.js';
import { TradingService } from './trading.service.js';

export class ClientConfigDto {
  @ApiProperty({ description: 'Development helpers are available (never in production)' })
  devTools!: boolean;
}

export class CreatedAccountDto {
  @ApiProperty() id!: string;
}

@ApiTags('config')
@Controller()
export class DevToolsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rules: RulesService,
    private readonly trading: TradingService,
  ) {}

  @Public()
  @Get('config')
  @ApiOkResponse({ type: ClientConfigDto })
  clientConfig(): ClientConfigDto {
    return { devTools: this.config.devToolsEnabled };
  }

  /** DEV ONLY: open an example $25,000 funded account with the example rule set. */
  @Post('dev/example-funded-account')
  @HttpCode(201)
  @ApiOkResponse({ type: CreatedAccountDto })
  async exampleFunded(@CurrentUser() u: AuthUser): Promise<CreatedAccountDto> {
    if (!this.config.devToolsEnabled) throw Errors.notFound('Route');
    const ruleSet = await this.rules.latest('INSTANT_EXAMPLE');
    const id = await this.trading.openRuleAccount({
      userId: u.id,
      ruleSetId: ruleSet.id,
      kind: 'FUNDED',
      initialBalanceMinor: 2_500_000n,
      label: 'Instant $25K (example)',
      actor: { type: 'USER', id: u.id },
    });
    return { id };
  }
}
