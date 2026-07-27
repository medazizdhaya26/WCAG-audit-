import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PAGE_AUDIT_QUEUE, REPORT_QUEUE } from '../../../libs/queues/src/queues.module';
import { REDIS_CONNECTION } from '../../../libs/queues/src/redis.provider';
import { normalizeUrl } from '../../../libs/common/src/url/url-utils';
import { LinkExtractorService } from './link-extractor.service';
import { WebsiteAudit } from '../../../libs/database/src/entities/website-audit.entity';
import { PageAudit } from '../../../libs/database/src/entities/page-audit.entity';
import { PageAuditStatus, WebsiteAuditStatus } from '../../../libs/database/src/entities/enums';

type CrawlQueueItem = { url: string; depth: number };

@Injectable()
export class CrawlerService {
  constructor(
    @InjectRepository(WebsiteAudit) private readonly websiteAudits: Repository<WebsiteAudit>,
    @InjectRepository(PageAudit) private readonly pageAudits: Repository<PageAudit>,
    private readonly linkExtractor: LinkExtractorService,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
    @Inject(PAGE_AUDIT_QUEUE) private readonly pageAuditQueue: Queue,
    @Inject(REPORT_QUEUE) private readonly reportQueue: Queue,
  ) {}

  async crawlWebsite(websiteAuditId: string): Promise<void> {
    const audit = await this.websiteAudits.findOne({ where: { id: websiteAuditId } });
    if (!audit) return;

    await this.websiteAudits.update({ id: websiteAuditId }, { status: WebsiteAuditStatus.AUDITING });

    const seenKey = `websiteAudit:${websiteAuditId}:seen`;
    await this.redis.del(seenKey);

    const rootUrl = normalizeUrl(audit.rootUrl);
    const queue: CrawlQueueItem[] = [{ url: rootUrl, depth: 0 }];
    await this.redis.sadd(seenKey, normalizeUrl(rootUrl));

    let pagesDiscovered = 0;
    let pagesQueued = 0;

    while (queue.length > 0 && pagesDiscovered < audit.maxPages) {
      const current = queue.shift()!;
      if (current.depth > audit.maxDepth) continue;

      const extraction = await this.linkExtractor.extractLinks({
        url: current.url,
        rootUrl,
        renderJs: audit.renderJs,
      });

      const normalizedFinalUrl = normalizeUrl(extraction.finalUrl);
      let pageAudit = await this.pageAudits.findOne({
        where: { websiteAuditId, normalizedUrl: normalizedFinalUrl },
      });

      if (!pageAudit) {
        pageAudit = await this.pageAudits.save(
          this.pageAudits.create({
            websiteAuditId,
            url: extraction.finalUrl,
            normalizedUrl: normalizedFinalUrl,
            depth: current.depth,
            status: PageAuditStatus.QUEUED,
            finalUrl: null,
            startedAt: null,
            finishedAt: null,
            httpStatus: null,
            title: null,
            lighthouseScore: null,
            pageScore: null,
            axeRaw: null,
            errorMessage: null,
          }),
        );
        pagesDiscovered += 1;
      } else {
        const nextDepth = Math.min(current.depth, 1000);
        if (pageAudit.url !== extraction.finalUrl || pageAudit.depth !== nextDepth) {
          await this.pageAudits.update(
            { id: pageAudit.id },
            { url: extraction.finalUrl, depth: nextDepth },
          );
          pageAudit.url = extraction.finalUrl;
          pageAudit.depth = nextDepth;
        }
      }

      const auditJobId = this.pageAuditJobId(websiteAuditId, normalizedFinalUrl);
      try {
        await this.pageAuditQueue.add(
          'audit-page',
          { websiteAuditId, pageAuditId: pageAudit.id, url: extraction.finalUrl },
          { jobId: auditJobId },
        );
        pagesQueued += 1;
      } catch {
        // Job already exists or queue issue; keep crawling without crashing the crawl worker.
      }

      await this.websiteAudits.update(
        { id: websiteAuditId },
        {
          pagesDiscovered,
          pagesQueued,
        },
      );

      for (const discovered of extraction.discoveredUrls) {
        if (pagesDiscovered + queue.length >= audit.maxPages) break;
        const normalized = normalizeUrl(discovered);
        const added = await this.redis.sadd(seenKey, normalized);
        if (added === 1) {
          queue.push({ url: discovered, depth: current.depth + 1 });
        }
      }
    }
  }

  private pageAuditJobId(websiteAuditId: string, normalizedUrl: string): string {
    const hash = createHash('sha1').update(normalizedUrl).digest('hex');
    return `audit_${websiteAuditId}_${hash}`;
  }
}
