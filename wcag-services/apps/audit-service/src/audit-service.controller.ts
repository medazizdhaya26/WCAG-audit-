import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AuditServiceService } from './audit-service.service';

@Controller('audit')
export class AuditServiceController {
  constructor(private readonly auditService: AuditServiceService) {}

  @Post()
  async runAudit(@Body('url') url: string) {
    if (!url) {
      throw new BadRequestException('URL is required');
    }
    try {
      return await this.auditService.runAudit(url);
    } catch (error) {
      throw new BadRequestException(`Failed to run audit: ${error.message}`);
    }
  }

  // Mode développeur : audit direct de code HTML/CSS/JS
  @Post('inline')
  async runInline(@Body() body: { html?: string; css?: string; js?: string }) {
    try {
      return await this.auditService.runInlineAudit(body ?? {});
    } catch (error) {
      throw new BadRequestException(`Audit inline échoué: ${error.message}`);
    }
  }

  // Mode développeur : audit d'un fichier uploadé (détection de framework)
  @Post('file')
  async runFile(@Body() body: { filename?: string; content?: string }) {
    try {
      return await this.auditService.runFileAudit(body ?? {});
    } catch (error) {
      throw new BadRequestException(`Audit fichier échoué: ${error.message}`);
    }
  }
}
