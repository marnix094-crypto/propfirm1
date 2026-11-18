import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Errors } from '../../common/errors.js';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator.js';
import { OfferDto, OfferListDto, PointsSummaryDto, RedeemDto } from './dto.js';
import { RewardsService } from './rewards.service.js';

@ApiTags('rewards')
@Controller()
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get('points')
  @ApiOkResponse({ type: PointsSummaryDto })
  points(@CurrentUser() u: AuthUser) {
    return this.rewards.summary(u.id);
  }

  @Post('points/redeem')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: OfferDto })
  redeem(
    @CurrentUser() u: AuthUser,
    @Body() dto: RedeemDto,
    @Headers('idempotency-key') key?: string,
  ) {
    if (!key || !/^[A-Za-z0-9_-]{8,80}$/.test(key))
      throw Errors.unprocessable('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
    return this.rewards.redeem(u.id, dto.rewardId, key);
  }

  @Get('offers')
  @ApiOkResponse({ type: OfferListDto })
  async offers(@CurrentUser() u: AuthUser): Promise<OfferListDto> {
    return { items: await this.rewards.offers(u.id) };
  }
}
