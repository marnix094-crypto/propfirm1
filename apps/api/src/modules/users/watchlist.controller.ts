import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, Matches } from 'class-validator';
import { PrismaService } from '../../infra/prisma.service.js';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator.js';
import { MarketDataService } from '../market-data/market-data.service.js';

export class WatchlistDto {
  @ApiProperty({ type: [String], example: ['BTCUSDT', 'ETHUSDT'] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Matches(/^[A-Z0-9]{2,20}$/, { each: true })
  symbols!: string[];
}

const DEFAULT_WATCHLIST = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

@ApiTags('me')
@Controller('me/watchlist')
export class WatchlistController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly md: MarketDataService,
  ) {}

  @Get()
  @ApiOkResponse({ type: WatchlistDto })
  async get(@CurrentUser() u: AuthUser): Promise<WatchlistDto> {
    const row = await this.prisma.watchlist.findUnique({ where: { userId: u.id } });
    return { symbols: row?.symbols ?? DEFAULT_WATCHLIST };
  }

  @Put()
  @ApiOkResponse({ type: WatchlistDto })
  async put(@CurrentUser() u: AuthUser, @Body() dto: WatchlistDto): Promise<WatchlistDto> {
    const known = new Set(this.md.instruments().map((i) => i.symbol));
    const symbols = [...new Set(dto.symbols)].filter((s) => known.has(s));
    await this.prisma.watchlist.upsert({
      where: { userId: u.id },
      create: { userId: u.id, symbols },
      update: { symbols },
    });
    return { symbols };
  }
}
