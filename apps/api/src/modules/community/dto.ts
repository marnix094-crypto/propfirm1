import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, Matches } from 'class-validator';

export class TraderProfileDto {
  @ApiProperty({ type: String, nullable: true }) nickname!: string | null;
  @ApiProperty() leaderboardOptIn!: boolean;
}

export class UpdateTraderProfileDto {
  @ApiPropertyOptional({ description: '3–20 letters, digits or _', example: 'lime_trader' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9_]{3,20}$/)
  nickname?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() leaderboardOptIn?: boolean;
}

export class RankingRowDto {
  @ApiProperty() rank!: number;
  @ApiProperty({ description: 'Public nickname or an anonymous label' }) name!: string;
  @ApiProperty() isYou!: boolean;
  @ApiProperty({ description: 'Return on the starting balance, basis points' }) returnBps!: number;
  @ApiProperty() accountSizeMinor!: string;
  @ApiProperty() pnlMinor!: string;
  @ApiProperty() trades!: number;
}

export class LeaderboardDto {
  @ApiProperty({ type: [RankingRowDto] }) rows!: RankingRowDto[];
  @ApiProperty({
    type: RankingRowDto,
    nullable: true,
    description: 'Your best funded account, even if not public',
  })
  you!: RankingRowDto | null;
  @ApiProperty() youArePublic!: boolean;
  @ApiProperty() updatedAt!: string;
}

export class CompetitionDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() startsAt!: string;
  @ApiProperty() endsAt!: string;
  @ApiProperty({ enum: ['UPCOMING', 'RUNNING', 'ENDED'] }) status!:
    'UPCOMING' | 'RUNNING' | 'ENDED';
  @ApiProperty() startingBalanceMinor!: string;
  @ApiProperty() maxLeverage!: number;
  @ApiProperty({ type: String, nullable: true }) prize!: string | null;
  @ApiProperty() entrants!: number;
  @ApiProperty({ type: String, nullable: true, description: 'Your competition account' })
  yourAccountId!: string | null;
  @ApiProperty({ type: [RankingRowDto], description: 'Top 50 by return' })
  standings!: RankingRowDto[];
  @ApiProperty({ type: RankingRowDto, nullable: true }) you!: RankingRowDto | null;
}

export class CompetitionListDto {
  @ApiProperty({ type: [CompetitionDto] }) items!: CompetitionDto[];
}

export class TransparencyDto {
  @ApiProperty() traders!: number;
  @ApiProperty({ description: 'Funded accounts sold (paid purchases)' }) fundedAccounts!: number;
  @ApiProperty() activeFundedAccounts!: number;
  @ApiProperty() closedFundedAccounts!: number;
  @ApiProperty({ description: 'Real payouts only (none before payouts launch)' }) payouts!: number;
  @ApiProperty() payoutsTotalMinor!: string;
  @ApiProperty() competitions!: number;
  @ApiProperty() updatedAt!: string;
}
