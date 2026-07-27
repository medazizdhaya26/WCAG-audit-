import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebsiteAudit } from '../../../libs/database/src/entities/website-audit.entity';
import { PageAudit } from '../../../libs/database/src/entities/page-audit.entity';
import { AccessibilityIssue } from '../../../libs/database/src/entities/accessibility-issue.entity';

@Injectable()
export class ExportService {
  constructor(
    @InjectRepository(WebsiteAudit)
    private readonly websiteAudits: Repository<WebsiteAudit>,
    @InjectRepository(PageAudit)
    private readonly pageAudits: Repository<PageAudit>,
    @InjectRepository(AccessibilityIssue)
    private readonly issues: Repository<AccessibilityIssue>,
  ) {}

  async exportToJSON(websiteAuditId: string): Promise<string> {
    const websiteAudit = await this.websiteAudits.findOne({
      where: { id: websiteAuditId },
      relations: { pages: { issues: true, screenshot: true } },
    });

    if (!websiteAudit) {
      throw new Error('Website audit not found');
    }

    return JSON.stringify(websiteAudit, null, 2);
  }

  async exportToCSV(websiteAuditId: string): Promise<string> {
    const websiteAudit = await this.websiteAudits.findOne({
      where: { id: websiteAuditId },
      relations: { pages: { issues: true } },
    });

    if (!websiteAudit) {
      throw new Error('Website audit not found');
    }

    const issueRows: string[] = [];

    issueRows.push([
      'Page URL',
      'Page Score',
      'Issue Rule',
      'Impact',
      'Description',
      'Help',
      'Help URL',
      'Node Count',
    ].join(','));

    for (const page of websiteAudit.pages) {
      for (const issue of page.issues) {
        const row = [
          this.escapeCSV(page.url),
          String(page.pageScore ?? page.lighthouseScore ?? 0),
          this.escapeCSV(issue.ruleId ?? ''),
          this.escapeCSV(issue.impact),
          this.escapeCSV(issue.description ?? ''),
          this.escapeCSV(issue.help ?? ''),
          this.escapeCSV(issue.helpUrl ?? ''),
          String(issue.nodes ?? 1),
        ].join(',');
        issueRows.push(row);
      }
    }

    if (issueRows.length === 1) {
      issueRows.push([
        this.escapeCSV(websiteAudit.rootUrl),
        String(websiteAudit.globalScore ?? 0),
        '',
        '',
        '',
        '',
        '',
        '',
      ].join(','));
    }

    return issueRows.join('\n');
  }

  private escapeCSV(value: string): string {
    if (!value) return '';
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
