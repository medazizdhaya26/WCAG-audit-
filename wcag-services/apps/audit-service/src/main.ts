import { NestFactory } from '@nestjs/core';
import { AuditServiceModule } from './audit-service.module';
import { json, urlencoded } from 'express';

// Filet de sécurité : une erreur asynchrone parasite (ex: Lighthouse "Target closed")
// ne doit JAMAIS tuer le service d'audit — on la logge et on continue.
process.on('unhandledRejection', (reason: any) => {
  console.error('[AUDIT-SERVICE] Unhandled rejection (ignorée):', reason?.message ?? reason);
});
process.on('uncaughtException', (err: any) => {
  console.error('[AUDIT-SERVICE] Uncaught exception (ignorée):', err?.message ?? err);
});

async function bootstrap() {
  const app = await NestFactory.create(AuditServiceModule);
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.enableCors();
  await app.listen(process.env.AUDIT_SERVICE_PORT ?? process.env.PORT ?? 3000);
}
bootstrap();
