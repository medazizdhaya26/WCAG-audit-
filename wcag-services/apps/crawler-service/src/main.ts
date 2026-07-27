import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { CrawlerServiceModule } from './crawler-service.module';

async function bootstrap() {
  const app = await NestFactory.create(CrawlerServiceModule);
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.enableCors();
  await app.listen(process.env.PORT ?? 3002);
}

bootstrap();

