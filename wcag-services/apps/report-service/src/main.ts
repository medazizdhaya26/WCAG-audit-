import { NestFactory } from '@nestjs/core';
import { ReportServiceModule } from './report-service.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(ReportServiceModule);
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.enableCors();
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
