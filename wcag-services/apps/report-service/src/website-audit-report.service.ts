import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AccessibilityIssue } from '../../../libs/database/src/entities/accessibility-issue.entity';
import { PageAudit } from '../../../libs/database/src/entities/page-audit.entity';
import { Screenshot } from '../../../libs/database/src/entities/screenshot.entity';
import { WebsiteAudit } from '../../../libs/database/src/entities/website-audit.entity';

@Injectable()
export class WebsiteAuditReportService {
  constructor(
    @InjectRepository(WebsiteAudit) private readonly websiteAudits: Repository<WebsiteAudit>,
    @InjectRepository(PageAudit) private readonly pageAudits: Repository<PageAudit>,
    @InjectRepository(AccessibilityIssue) private readonly issues: Repository<AccessibilityIssue>,
    @InjectRepository(Screenshot) private readonly screenshots: Repository<Screenshot>,
  ) {}

  async getWebsiteAudit(id: string) {
    const audit = await this.websiteAudits.findOne({ where: { id } });
    if (!audit) throw new NotFoundException('WebsiteAudit not found');
    const pages = await this.listPages(id);
    return { ...audit, pages };
  }

  async listPages(websiteAuditId: string) {
    const pages = await this.pageAudits.find({
      where: { websiteAuditId },
      order: { depth: 'ASC', url: 'ASC' },
      select: [
        'id',
        'url',
        'finalUrl',
        'depth',
        'status',
        'lighthouseScore',
        'pageScore',
        'httpStatus',
        'errorMessage',
        'finishedAt',
      ],
    });
    return pages;
  }

  async getPageAudit(id: string, includeScreenshot: boolean, includeHtml = false) {
    const page = await this.pageAudits.findOne({
      where: { id },
      relations: { issues: true, screenshot: includeScreenshot },
    });
    if (!page) throw new NotFoundException('PageAudit not found');

    // On évite de renvoyer le HTML complet à chaque polling (lourd) sauf si demandé.
    if (!includeHtml) {
      (page as any).html = undefined;
    }

    if (!includeScreenshot || !page.screenshot) return page;

    const mime = page.screenshot.mime;
    const base64 = Buffer.from(page.screenshot.data).toString('base64');
    return {
      ...page,
      screenshot: {
        ...page.screenshot,
        dataUrl: `data:${mime};base64,${base64}`,
      },
    };
  }

  /** Filtre par propriétaire : null = tous (admin), '__none__' = aucun (anonyme), sinon = les siens. */
  private ownerWhere(ownerId: string | null): Record<string, unknown> | undefined {
    if (ownerId === null) return undefined;        // admin → tout
    return { ownerId };                            // user (ou '__none__' → 0 résultat)
  }

  // ── Liste des sites audités (filtrée par utilisateur) ────────────────────
  async listAllWebsiteAudits(ownerId: string | null = null) {
    return this.websiteAudits.find({
      where: this.ownerWhere(ownerId),
      order: { startedAt: 'DESC' },
      take: 500,
    });
  }

  // ── Statistiques dashboard (filtrées par utilisateur) ────────────────────
  async getDashboardStats(ownerId: string | null = null) {
    const audits = await this.websiteAudits.find({ where: this.ownerWhere(ownerId) });

    const totalSites = audits.length;
    const completedSites = audits.filter((a) => a.status === 'COMPLETED').length;

    const scores = audits
      .map((a) => a.globalScore)
      .filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
    const avgScore = scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : 0;

    // Ids des audits concernés (pour filtrer pages/erreurs par utilisateur)
    const auditIds = audits.map((a) => a.id);
    const scoped = ownerId !== null; // filtre actif
    if (scoped && auditIds.length === 0) {
      return { totalSites: 0, completedSites: 0, totalPages: 0, totalIssues: 0, avgScore: 0,
        severity: { CRITICAL: 0, SERIOUS: 0, MODERATE: 0, MINOR: 0, UNKNOWN: 0 }, worstSites: [] };
    }

    const totalPages = scoped
      ? await this.pageAudits.count({ where: { websiteAuditId: In(auditIds) } })
      : await this.pageAudits.count();

    // Répartition des issues par sévérité (filtrée si utilisateur)
    const qb = this.issues
      .createQueryBuilder('i')
      .select('i.impact', 'impact')
      .addSelect('COUNT(*)', 'count')
      .groupBy('i.impact');
    if (scoped) {
      qb.innerJoin('page_audits', 'p', 'p.id = i."pageAuditId"').andWhere('p."websiteAuditId" IN (:...ids)', { ids: auditIds });
    }
    const rows = await qb.getRawMany<{ impact: string; count: string }>();

    const severity = { CRITICAL: 0, SERIOUS: 0, MODERATE: 0, MINOR: 0, UNKNOWN: 0 } as Record<string, number>;
    let totalIssues = 0;
    for (const r of rows) {
      const n = Number(r.count) || 0;
      severity[r.impact] = (severity[r.impact] ?? 0) + n;
      totalIssues += n;
    }

    // Top 5 des pires sites (score le plus bas)
    const worstSites = [...audits]
      .filter((a) => typeof a.globalScore === 'number')
      .sort((a, b) => (a.globalScore ?? 0) - (b.globalScore ?? 0))
      .slice(0, 5)
      .map((a) => ({ id: a.id, rootUrl: a.rootUrl, globalScore: a.globalScore }));

    return {
      totalSites,
      completedSites,
      totalPages,
      totalIssues,
      avgScore,
      severity,
      worstSites,
    };
  }

  async exportWebsiteAudit(id: string) {
    const audit = await this.websiteAudits.findOne({ where: { id } });
    if (!audit) throw new NotFoundException('WebsiteAudit not found');

    const pages = await this.pageAudits.find({
      where: { websiteAuditId: id },
      order: { depth: 'ASC', url: 'ASC' },
      relations: { issues: true },
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

    await this.websiteAudits.delete(id);
  }
}
