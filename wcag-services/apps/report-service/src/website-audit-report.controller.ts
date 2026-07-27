import { Controller, Get, Param, Query, Res, Header, Delete } from '@nestjs/common';
import { WebsiteAuditReportService } from './website-audit-report.service';
import { ExportService } from './export.service';
import { CurrentUser, type AuthUser } from '../../../libs/auth/src/current-user.decorator';
import type { Response } from 'express';

@Controller()
export class WebsiteAuditReportController {
  constructor(
    private readonly reports: WebsiteAuditReportService,
    private readonly exportService: ExportService,
  ) {}

  @Get('dashboard/stats')
  async dashboardStats(@CurrentUser() user: AuthUser | null) {
    const isAdmin = user?.roles?.includes('ADMIN') ?? false;
    return this.reports.getDashboardStats(isAdmin ? null : user?.sub ?? '__none__');
  }

  @Get('website-audits')
  async listAllWebsiteAudits(@CurrentUser() user: AuthUser | null) {
    // Admin → tous les audits ; utilisateur → les siens ; anonyme → aucun.
    const isAdmin = user?.roles?.includes('ADMIN') ?? false;
    return this.reports.listAllWebsiteAudits(isAdmin ? null : user?.sub ?? '__none__');
  }

  @Get('website-audits/:id')
  async getWebsiteAudit(@Param('id') id: string) {
    return this.reports.getWebsiteAudit(id);
  }

  @Get('website-audits/:id/pages')
  async listPages(@Param('id') id: string) {
    return this.reports.listPages(id);
  }

  @Get('page-audits/:id')
  async getPage(
    @Param('id') id: string,
    @Query('includeScreenshot') includeScreenshot?: string,
    @Query('includeHtml') includeHtml?: string,
  ) {
    return this.reports.getPageAudit(id, includeScreenshot === 'true', includeHtml === 'true');
  }

  @Get('website-audits/:id/export')
  async export(@Param('id') id: string) {
    return this.reports.exportWebsiteAudit(id);
  }

  @Get('website-audits/:id/export/json')
  @Header('Content-Type', 'application/json')
  @Header('Content-Disposition', 'attachment; filename="audit-report.json"')
  async exportJSON(@Param('id') id: string, @Res() res: Response) {
    const jsonContent = await this.exportService.exportToJSON(id);
    res.send(jsonContent);
  }

  @Get('website-audits/:id/export/csv')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="audit-report.csv"')
  async exportCSV(@Param('id') id: string, @Res() res: Response) {
    const csvContent = await this.exportService.exportToCSV(id);
    res.send(csvContent);
  }

  @Delete('website-audits/:id')
  async deleteWebsiteAudit(@Param('id') id: string): Promise<void> {
    return this.reports.deleteWebsiteAudit(id);
  }
}

