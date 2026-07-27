import { Global, Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES } from './queue.constants';
import { REDIS_CONNECTION, RedisProvider } from './redis.provider';

export { REDIS_CONNECTION } from './redis.provider';

export const CRAWL_QUEUE = Symbol('CRAWL_QUEUE');
export const PAGE_AUDIT_QUEUE = Symbol('PAGE_AUDIT_QUEUE');
export const REPORT_QUEUE = Symbol('REPORT_QUEUE');

function createQueue(name: string, connection: IORedis): Queue {
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

@Global()
@Module({
  providers: [
    RedisProvider,
    {
      provide: CRAWL_QUEUE,
      useFactory: (connection: IORedis) => createQueue(QUEUE_NAMES.CRAWL, connection),
      inject: [REDIS_CONNECTION],
    },
    {
      provide: PAGE_AUDIT_QUEUE,
      useFactory: (connection: IORedis) => createQueue(QUEUE_NAMES.PAGE_AUDIT, connection),
      inject: [REDIS_CONNECTION],
    },
    {
      provide: REPORT_QUEUE,
      useFactory: (connection: IORedis) => createQueue(QUEUE_NAMES.REPORT, connection),
      inject: [REDIS_CONNECTION],
    },
  ],
  exports: [REDIS_CONNECTION, CRAWL_QUEUE, PAGE_AUDIT_QUEUE, REPORT_QUEUE],
})
export class QueuesModule {}
