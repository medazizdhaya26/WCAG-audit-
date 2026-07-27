import { Controller, Delete, Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import { CRAWL_QUEUE, PAGE_AUDIT_QUEUE, REPORT_QUEUE } from '../../../libs/queues/src/queues.module';

@Controller('queue')
export class QueueCleanupController {
  constructor(
    @Inject(CRAWL_QUEUE) private readonly crawlQueue: Queue,
    @Inject(PAGE_AUDIT_QUEUE) private readonly pageAuditQueue: Queue,
    @Inject(REPORT_QUEUE) private readonly reportQueue: Queue,
  ) {}

  @Delete('clean')
  async cleanAllQueues() {
    await Promise.all([
      this.crawlQueue.drain(),
      this.crawlQueue.obliterate({ force: true }),
      this.pageAuditQueue.drain(),
      this.pageAuditQueue.obliterate({ force: true }),
      this.reportQueue.drain(),
      this.reportQueue.obliterate({ force: true }),
    ]);
    return { success: true, message: 'All queues cleaned successfully' };
  }
}
