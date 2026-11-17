import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role } from '../../generated/prisma/client.js';

export interface AuthUser {
  id: string;
  roles: Role[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
  },
);
