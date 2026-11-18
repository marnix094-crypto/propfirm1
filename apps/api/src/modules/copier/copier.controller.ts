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
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator.js';
import { CopierService } from './copier.service.js';
import {
  CopierLinkDto,
  CopierOverviewDto,
  CreateCopierLinkDto,
  UpdateCopierLinkDto,
} from './dto.js';

const UUID = new ParseUUIDPipe({ version: '7' });

@ApiTags('copier')
@Controller('copier')
export class CopierController {
  constructor(private readonly copier: CopierService) {}

  @Get()
  @ApiOkResponse({ type: CopierOverviewDto })
  overview(@CurrentUser() u: AuthUser) {
    return this.copier.overview(u.id);
  }

  @Post('links')
  @ApiCreatedResponse({ type: CopierLinkDto })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateCopierLinkDto) {
    return this.copier.create(u.id, dto);
  }

  @Patch('links/:id')
  @ApiOkResponse({ type: CopierLinkDto })
  update(
    @CurrentUser() u: AuthUser,
    @Param('id', UUID) id: string,
    @Body() dto: UpdateCopierLinkDto,
  ) {
    return this.copier.update(u.id, id, dto);
  }

  @Delete('links/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string) {
    return this.copier.remove(u.id, id);
  }
}
