import { BadRequestException, Controller, Get, Param, Post, Body, Delete } from '@nestjs/common';
import type { StartWebsiteAuditDto } from './dto/start-website-audit.dto';
import { WebsiteAuditService } from './website-audit.service';
import { CurrentUser, type AuthUser } from '../../../libs/auth/src/current-user.decorator';

@Controller('website-audits')
export class CrawlerServiceController {
  constructor(private readonly websiteAuditService: WebsiteAuditService) {}

  @Post()
  async start(@Body() dto: StartWebsiteAuditDto, @CurrentUser() user: AuthUser | null) {
    if (!dto?.url) throw new BadRequestException('url is required');
    return this.websiteAuditService.start(dto, user?.sub ?? null);
  }

  @Get(':id')
  async getStatus(@Param('id') id: string) {
    return this.websiteAuditService.getStatus(id);
  }

  @Delete(':id')
  async deleteWebsiteAudit(@Param('id') id: string): Promise<void> {
    return this.websiteAuditService.deleteWebsiteAudit(id);
  }
}
