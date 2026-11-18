import { RequiresModule } from '../firms/module.guard.js';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { FirmsService } from '../firms/firms.service.js';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator.js';
import { CommunityService } from './community.service.js';
import {
  CompetitionDto,
  CompetitionListDto,
  LeaderboardDto,
  TraderProfileDto,
  TransparencyDto,
  UpdateTraderProfileDto,
} from './dto.js';

const UUID = new ParseUUIDPipe({ version: '7' });

@ApiTags('community')
@Controller()
export class CommunityController {
  constructor(
    private readonly community: CommunityService,
    private readonly firms: FirmsService,
  ) {}

  @Get('me/profile')
  @ApiOkResponse({ type: TraderProfileDto })
  profile(@CurrentUser() u: AuthUser) {
    return this.community.profile(u.id);
  }

  @Patch('me/profile')
  @ApiOkResponse({ type: TraderProfileDto })
  updateProfile(@CurrentUser() u: AuthUser, @Body() dto: UpdateTraderProfileDto) {
    return this.community.updateProfile(u.id, dto);
  }

  @RequiresModule('leaderboard')
  @Get('leaderboard')
  @ApiOkResponse({ type: LeaderboardDto })
  leaderboard(@CurrentUser() u: AuthUser) {
    return this.community.leaderboard(u.id);
  }

  @RequiresModule('competitions')
  @Get('competitions')
  @ApiOkResponse({ type: CompetitionListDto })
  async competitions(@CurrentUser() u: AuthUser): Promise<CompetitionListDto> {
    return { items: await this.community.competitions(u.id) };
  }

  @RequiresModule('competitions')
  @Post('competitions/:id/join')
  @ApiOkResponse({ type: CompetitionDto })
  join(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string) {
    return this.community.join(u.id, id);
  }

  @Public()
  @RequiresModule('transparency')
  @Get('public/transparency')
  @ApiOkResponse({ type: TransparencyDto })
  async transparency(@Req() req: Request) {
    return this.community.transparency((await this.firms.fromRequest(req)).id);
  }
}
