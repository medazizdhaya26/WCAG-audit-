import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Garde JWT Keycloak.
 * - Activée uniquement si AUTH_ENABLED=true (sinon laisse tout passer → non-bloquant).
 * - Valide le token Bearer via le JWKS de Keycloak (signature RS256).
 * - Le gateway Spring relaie déjà le token (TokenRelayFilter) → les services le revalident.
 */
@Injectable()
export class KeycloakJwtGuard implements CanActivate {
  private readonly logger = new Logger(KeycloakJwtGuard.name);
  private readonly enabled = process.env.AUTH_ENABLED === 'true';
  private readonly issuer = process.env.KEYCLOAK_ISSUER || 'http://localhost:8081/realms/e-commerce';
  private readonly jwks = new JwksClient({
    jwksUri: process.env.KEYCLOAK_JWKS_URI || `${this.issuer}/protocol/openid-connect/certs`,
    cache: true,
    cacheMaxAge: 10 * 60 * 1000,
    rateLimit: true,
  });

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest();
    const auth: string | undefined = req.headers?.authorization;
    const hasBearer = auth?.startsWith('Bearer ');

    // Pas de token
    if (!hasBearer) {
      if (this.enabled && !isPublic) throw new UnauthorizedException('Token manquant');
      return true; // auth non forcée → on laisse passer sans utilisateur
    }

    // Token présent → on le valide (opportuniste : on peuple req.user même si auth non forcée)
    try {
      const payload = await this.verify(auth!.slice(7));
      req.user = {
        sub: payload.sub,
        username: payload.preferred_username || payload.email || payload.sub,
        email: payload.email,
        roles: payload?.realm_access?.roles ?? [],
      };
      return true;
    } catch (e: any) {
      this.logger.warn(`JWT rejeté: ${e?.message}`);
      // Auth forcée → refus ; sinon on ignore le token invalide
      if (this.enabled && !isPublic) throw new UnauthorizedException('Token invalide');
      return true;
    }
  }

  private verify(token: string): Promise<any> {
    const getKey: jwt.GetPublicKeyOrSecret = (header, cb) => {
      this.jwks.getSigningKey(header.kid, (err, key) => {
        if (err) return cb(err);
        cb(null, key!.getPublicKey());
      });
    };
    return new Promise((resolve, reject) => {
      jwt.verify(token, getKey, { algorithms: ['RS256'], issuer: this.issuer }, (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded);
      });
    });
  }
}
