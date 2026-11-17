import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';

@ApiTags('health')
@Public()
@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok' as const, time: new Date().toISOString() };
  }
}
