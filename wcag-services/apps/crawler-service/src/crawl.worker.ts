import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IORedis from 'ioredis';
import { Job, Worker } from 'bullmq';
import { REDIS_CONNECTION } from '../../../libs/queues/src/redis.provider';
import { QUEUE_NAMES } from '../../../libs/queues/src/queue.constants';
import { CrawlerService } from './crawler.service';

@Injectable()
export class CrawlWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(
    private readonly crawlerService: CrawlerService,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
  ) {}

  onModuleInit() {
    const concurrency = Number(process.env.CRAWL_WORKER_CONCURRENCY ?? '1');
    this.worker = new Worker(
      QUEUE_NAMES.CRAWL,
      async (job: Job) => {
        if (job.name !== 'crawl-website') return;
        await this.crawlerService.crawlWebsite(job.data.websiteAuditId);
      },
      { connection: this.redis, concurrency },
    );
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }
}

