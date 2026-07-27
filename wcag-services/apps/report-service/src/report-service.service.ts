import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditReport } from './entities/audit-report.entity';
import { PageAudit } from '../../../libs/database/src/entities/page-audit.entity';
import { WebsiteAudit } from '../../../libs/database/src/entities/website-audit.entity';
import { WebsiteAuditStatus, PageAuditStatus } from '../../../libs/database/src/entities/enums';

@Injectable()
export class ReportServiceService {
  constructor(
    @InjectRepository(WebsiteAudit) private readonly websiteAudits: Repository<WebsiteAudit>,
    @InjectRepository(PageAudit) private readonly pageAudits: Repository<PageAudit>,
  ) {}

  async findAll(): Promise<AuditReport[]> {
    const pages = await this.pageAudits.find({
      where: { depth: 0 },
      order: { finishedAt: 'DESC' },
      relations: { issues: true, screenshot: true },
      take: 200,
    });

    return pages.map((p) => {
      const impactCounts = { CRITICAL: 0, SERIOUS: 0, MODERATE: 0 };
      for (const issue of p.issues) {
        if (issue.impact === 'CRITICAL') impactCounts.CRITICAL += 1;
        if (issue.impact === 'SERIOUS') impactCounts.SERIOUS += 1;
        if (issue.impact === 'MODERATE') impactCounts.MODERATE += 1;
      }

      const screenshot =
        p.screenshot?.data && p.screenshot?.mime
          ? `data:${p.screenshot.mime};base64,${Buffer.from(p.screenshot.data).toString('base64')}`
          : null;

      return {
        id: p.id,
        url: p.url,
        score: Number(p.pageScore ?? p.lighthouseScore ?? 0),
        issues: p.issues,
        screenshot,
        critical: impactCounts.CRITICAL,
        serious: impactCounts.SERIOUS,
        moderate: impactCounts.MODERATE,
        createdAt: p.finishedAt ?? p.startedAt ?? new Date(),
      };
    });
  }

  async findOne(id: string): Promise<AuditReport | null> {
    const page = await this.pageAudits.findOne({
      where: { id },
      relations: { issues: true, screenshot: true },
    });
    if (!page) return null;

    const screenshot =
      page.screenshot?.data && page.screenshot?.mime
        ? `data:${page.screenshot.mime};base64,${Buffer.from(page.screenshot.data).toString('base64')}`
        : null;

    const critical = page.issues.filter((i) => i.impact === 'CRITICAL').length;
    const serious = page.issues.filter((i) => i.impact === 'SERIOUS').length;
    const moderate = page.issues.filter((i) => i.impact === 'MODERATE').length;

    return {
      id: page.id,
      url: page.url,
      score: Number(page.pageScore ?? page.lighthouseScore ?? 0),
      issues: page.issues,
      screenshot,
      critical,
      serious,
      moderate,
      createdAt: page.finishedAt ?? page.startedAt ?? new Date(),
    };
  }

  async create(reportData: Partial<AuditReport>): Promise<AuditReport> {
    const url = reportData.url ?? '';
    const websiteAudit = await this.websiteAudits.save(
      this.websiteAudits.create({
        rootUrl: url,
        normalizedRootUrl: url,
        maxDepth: 0,
        maxPages: 1,
        renderJs: true,
        status: WebsiteAuditStatus.COMPLETED,
        pagesDiscovered: 1,
        pagesQueued: 1,
        pagesCompleted: 1,
        pagesFailed: 0,
        pagesSkipped: 0,
        globalScore: reportData.score ?? 0,
        summary: null,
        errorMessage: null,
        finishedAt: new Date(),
      }),
    );

    const page = await this.pageAudits.save(
      this.pageAudits.create({
        websiteAuditId: websiteAudit.id,
        url,
        normalizedUrl: url,
        depth: 0,
        status: PageAuditStatus.COMPLETED,
        finishedAt: new Date(),
        lighthouseScore: reportData.score ?? 0,
        pageScore: reportData.score ?? 0,
        axeRaw: reportData.issues ?? null,
        finalUrl: null,
        startedAt: null,
        httpStatus: null,
        title: null,
        errorMessage: null,
      }),
    );

    return {
      id: page.id,
      url: page.url,
      score: Number(page.pageScore ?? 0),
      issues: reportData.issues ?? [],
      screenshot: reportData.screenshot ?? null,
      critical: reportData.critical ?? 0,
      serious: reportData.serious ?? 0,
      moderate: reportData.moderate ?? 0,
      createdAt: page.finishedAt ?? new Date(),
    };
  }

  async remove(id: string): Promise<void> {
    await this.pageAudits.delete({ id });
  }
}
