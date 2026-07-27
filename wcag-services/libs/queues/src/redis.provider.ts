import { Provider } from '@nestjs/common';
import IORedis from 'ioredis';

export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');

export function createRedisConnection(): IORedis {
  const host = process.env.REDIS_HOST ?? 'localhost';
  const port = Number(process.env.REDIS_PORT ?? '6379');
  const password = process.env.REDIS_PASSWORD || undefined;
  const db = Number(process.env.REDIS_DB ?? '0');

  return new IORedis({
    host,
    port,
    password,
    db,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}

export const RedisProvider: Provider = {
  provide: REDIS_CONNECTION,
  useFactory: () => createRedisConnection(),
};
