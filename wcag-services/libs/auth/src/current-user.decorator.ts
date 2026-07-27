import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthUser = { sub: string; username: string; email?: string; roles: string[] };

/** Récupère l'utilisateur (issu du JWT Keycloak) dans un contrôleur. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser | null => {
  const req = ctx.switchToHttp().getRequest();
  return req.user ?? null;
});
