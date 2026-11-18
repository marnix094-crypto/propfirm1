import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator.js';
import {
  CreateJournalEntryDto,
  JournalEntryDto,
  JournalPageDto,
  JournalQuery,
  UpdateJournalEntryDto,
} from './dto.js';
import { JournalService } from './journal.service.js';

const UUID = new ParseUUIDPipe({ version: '7' });

@ApiTags('journal')
@Controller('journal')
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Get()
  @ApiOkResponse({ type: JournalPageDto })
  list(@CurrentUser() u: AuthUser, @Query() q: JournalQuery) {
    return this.journal.list(u.id, q.cursor, q.limit);
  }

  @Post()
  @ApiCreatedResponse({ type: JournalEntryDto })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateJournalEntryDto) {
    return this.journal.create(u.id, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: JournalEntryDto })
  update(
    @CurrentUser() u: AuthUser,
    @Param('id', UUID) id: string,
    @Body() dto: UpdateJournalEntryDto,
  ) {
    return this.journal.update(u.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string) {
    return this.journal.remove(u.id, id);
  }
}
