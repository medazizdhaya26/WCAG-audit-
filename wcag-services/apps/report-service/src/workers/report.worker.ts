import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QUEUE_NAMES } from '../../../../libs/queues/src/queue.constants';
import { REDIS_CONNECTION } from '../../../../libs/queues/src/redis.provider';
import { AccessibilityIssue } from '../../../../libs/database/src/entities/accessibility-issue.entity';
import { PageAudit } from '../../../../libs/database/src/entities/page-audit.entity';
import { WebsiteAudit } from '../../../../libs/database/src/entities/website-audit.entity';
import { WebsiteAuditStatus } from '../../../../libs/database/src/entities/enums';

type ReportJobData = { websiteAuditId: string };

function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function pageWeight(depth: number): number {
  return 1 / (depth + 1);
}

@Injectable()
export class ReportWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(
    @InjectRepository(WebsiteAudit) private readonly websiteAudits: Repository<WebsiteAudit>,
    @InjectRepository(PageAudit) private readonly pageAudits: Repository<PageAudit>,
    @InjectRepository(AccessibilityIssue) private readonly issues: Repository<AccessibilityIssue>,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
  ) {}

  onModuleInit() {
    const concurrency = Number(process.env.REPORT_WORKER_CONCURRENCY ?? '1');
    this.worker = new Worker(
      QUEUE_NAMES.REPORT,
      async (job: Job<ReportJobData>) => this.handle(job),
      { connection: this.redis, concurrency },
    );
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  private async handle(job: Job<ReportJobData>) {
    if (job.name !== 'generate-report') return;
    const { websiteAuditId } = job.data;

    const audit = await this.websiteAudits.findOne({ where: { id: websiteAuditId } });
    if (!audit) return;

    const pages = await this.pageAudits.find({
      where: { websiteAuditId },
      relations: { issues: true },
    });

    const scoredPages = pages.map((p) => {
      const score = clampScore(p.pageScore ?? p.lighthouseScore ?? 0);
      const isFailed = p.status === 'FAILED';
      const effectiveScore = isFailed ? 0 : score;
      return { id: p.id, url: p.url, depth: p.depth, status: p.status, score: effectiveScore, issues: p.issues };
    });

    let weightedSum = 0;
    let weightSum = 0;
    for (const p of scoredPages) {
      const w = pageWeight(p.depth);
      weightedSum += p.score * w;
      weightSum += w;
    }

    const globalScore = weightSum > 0 ? clampScore(weightedSum / weightSum) : 0;

    const impactCounts = { CRITICAL: 0, SERIOUS: 0, MODERATE: 0, MINOR: 0, UNKNOWN: 0 } as Record<string, number>;
    for (const p of scoredPages) {
      for (const issue of p.issues) {
        impactCounts[issue.impact] = (impactCounts[issue.impact] ?? 0) + 1;
      }
    }

    const worstPages = [...scoredPages]
      .sort((a, b) => a.score - b.score)
      .slice(0, 10)
      .map((p) => ({ id: p.id, url: p.url, depth: p.depth, score: p.score, status: p.status }));

    const summary = {
      totals: {
        pages: scoredPages.length,
        completed: scoredPages.filter((p) => p.status === 'COMPLETED').length,
        failed: scoredPages.filter((p) => p.status === 'FAILED').length,
        skipped: scoredPages.filter((p) => p.status === 'SKIPPED').length,
      },
      issues: impactCounts,
      worstPages,
    };

    await this.websiteAudits.update(
      { id: websiteAuditId },
      {
        status: WebsiteAuditStatus.COMPLETED,
        finishedAt: new Date(),
        globalScore,
        summary: summary as any,
      },
    );
  }
}
