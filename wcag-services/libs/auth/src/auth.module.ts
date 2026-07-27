import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { KeycloakJwtGuard } from './keycloak-jwt.guard';

/**
 * Enregistre le guard Keycloak comme guard GLOBAL.
 * Non-bloquant : ne fait rien tant que AUTH_ENABLED != 'true'.
 * Importer AuthModule dans chaque service à sécuriser.
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: KeycloakJwtGuard }],
})
export class AuthModule {}
