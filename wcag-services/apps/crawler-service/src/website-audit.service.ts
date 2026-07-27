import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CRAWL_QUEUE } from '../../../libs/queues/src/queues.module';
import { StartWebsiteAuditDto } from './dto/start-website-audit.dto';
import { normalizeUrl } from '../../../libs/common/src/url/url-utils';
import { WebsiteAudit } from '../../../libs/database/src/entities/website-audit.entity';
import { AuditHistory } from '../../../libs/database/src/entities/audit-history.entity';
import { PageAudit } from '../../../libs/database/src/entities/page-audit.entity';
import { AccessibilityIssue } from '../../../libs/database/src/entities/accessibility-issue.entity';
import { Screenshot } from '../../../libs/database/src/entities/screenshot.entity';
import { WebsiteAuditStatus } from '../../../libs/database/src/entities/enums';

@Injectable()
export class WebsiteAuditService {
  constructor(
    @InjectRepository(WebsiteAudit) private readonly websiteAudits: Repository<WebsiteAudit>,
    @InjectRepository(AuditHistory) private readonly auditHistory: Repository<AuditHistory>,
    @InjectRepository(PageAudit) private readonly pageAudits: Repository<PageAudit>,
    @InjectRepository(AccessibilityIssue) private readonly issues: Repository<AccessibilityIssue>,
    @InjectRepository(Screenshot) private readonly screenshots: Repository<Screenshot>,
    @Inject(CRAWL_QUEUE) private readonly crawlQueue: Queue,
  ) {}

  async start(dto: StartWebsiteAuditDto, ownerId: string | null = null) {
    const normalizedRootUrl = normalizeUrl(dto.url);

    const websiteAudit = await this.websiteAudits.save(
      this.websiteAudits.create({
        ownerId,
        rootUrl: dto.url,
        normalizedRootUrl,
        maxDepth: dto.maxDepth ?? 3,
        maxPages: dto.maxPages ?? 200,
        renderJs: dto.renderJs ?? true,
        status: WebsiteAuditStatus.QUEUED,
        finishedAt: null,
        globalScore: null,
        summary: null,
        errorMessage: null,
      }),
    );

    await this.auditHistory.save(
      this.auditHistory.create({
        websiteAuditId: websiteAudit.id,
        params: {
          url: dto.url,
          maxDepth: dto.maxDepth ?? 3,
          maxPages: dto.maxPages ?? 200,
          renderJs: dto.renderJs ?? true,
        },
      }),
    );

    await this.crawlQueue.add(
      'crawl-website',
      { websiteAuditId: websiteAudit.id },
      { jobId: `crawl_${websiteAudit.id}` },
    );

    return { id: websiteAudit.id };
  }

  async getStatus(id: string) {
    const audit = await this.websiteAudits.findOne({ where: { id } });
    if (!audit) return null;

    const pages = await this.pageAudits.find({
      where: { websiteAuditId: id },
      order: { depth: 'ASC', url: 'ASC' },
      select: ['id', 'url', 'status', 'depth', 'lighthouseScore', 'pageScore', 'errorMessage', 'finalUrl', 'httpStatus', 'finishedAt'],
    });

    return { ...audit, pages };
  }

  async deleteWebsiteAudit(id: string): Promise<void> {
    const audit = await this.websiteAudits.findOne({ where: { id } });
    if (!audit) throw new NotFoundException('WebsiteAudit not found');

    const pageAuditIds = (await this.pageAudits.find({
      where: { websiteAuditId: id },
      select: ['id'],
    })).map(p => p.id);

    if (pageAuditIds.length > 0) {
      await this.issues.delete({ pageAuditId: In(pageAuditIds) });
      await this.screenshots.delete({ pageAuditId: In(pageAuditIds) });
      await this.pageAudits.delete({ id: In(pageAuditIds) });
    }

    await this.auditHistory.delete({ websiteAuditId: id });
    await this.websiteAudits.delete(id);
  }
}
