import {
  applyDecorators,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ClientModule } from '@brand/shared';
import { Errors } from '../../common/errors.js';
import type { AuthUser } from '../auth/current-user.decorator.js';
import { FirmsService } from './firms.service.js';

const MODULE = Symbol('client-module');

/**
 * Refuses a route when the firm switched this client-dashboard module off (D92). Signed-in
 * clients are checked against their own firm; public routes against the request's firm.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly firms: FirmsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const module =
      this.reflector.get<ClientModule | undefined>(MODULE, ctx.getHandler()) ??
      this.reflector.get<ClientModule | undefined>(MODULE, ctx.getClass());
    if (!module) return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const firm = req.user
      ? await this.firms.ofUser(req.user.id)
      : await this.firms.fromRequest(req);
    if (firm?.disabledModules.includes(module)) throw Errors.notFound('Module');
    return true;
  }
}

/** Marks a route/controller as part of a switchable client module. */
export const RequiresModule = (module: ClientModule) =>
  applyDecorators(SetMetadata(MODULE, module), UseGuards(ModuleGuard));
