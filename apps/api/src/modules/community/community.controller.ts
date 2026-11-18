import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
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
  constructor(private readonly community: CommunityService) {}

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

  @Get('leaderboard')
  @ApiOkResponse({ type: LeaderboardDto })
  leaderboard(@CurrentUser() u: AuthUser) {
    return this.community.leaderboard(u.id);
  }

  @Get('competitions')
  @ApiOkResponse({ type: CompetitionListDto })
  async competitions(@CurrentUser() u: AuthUser): Promise<CompetitionListDto> {
    return { items: await this.community.competitions(u.id) };
  }

  @Post('competitions/:id/join')
  @ApiOkResponse({ type: CompetitionDto })
  join(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string) {
    return this.community.join(u.id, id);
  }

  @Public()
  @Get('public/transparency')
  @ApiOkResponse({ type: TransparencyDto })
  transparency() {
    return this.community.transparency();
  }
}
