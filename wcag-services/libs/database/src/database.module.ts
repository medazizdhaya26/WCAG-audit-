import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? '5432'),
      username: process.env.DB_USERNAME ?? 'admin',
      password: process.env.DB_PASSWORD ?? 'admin',
      database: process.env.DB_DATABASE ?? 'wcagdb',
      autoLoadEntities: true,
      synchronize: (process.env.TYPEORM_SYNCHRONIZE ?? 'true') === 'true',
      logging: (process.env.TYPEORM_LOGGING ?? 'false') === 'true',
    }),
  ],
})
export class DatabaseModule {}

