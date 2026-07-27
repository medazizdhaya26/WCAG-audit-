import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '../../../libs/database/src/database.module';
import { QueuesModule } from '../../../libs/queues/src/queues.module';
import { AuthModule } from '../../../libs/auth/src/auth.module';
import { CrawlerServiceController } from './crawler-service.controller';
import { QueueCleanupController } from './queue-cleanup.controller';
import { WebsiteAuditService } from './website-audit.service';
import { LinkExtractorService } from './link-extractor.service';
import { CrawlerService } from './crawler.service';
import { CrawlWorker } from './crawl.worker';
import { SitemapParserService } from './sitemap-parser.service';
import { RobotsTxtService } from './robots-txt.service';
import { WebsiteAudit } from '../../../libs/database/src/entities/website-audit.entity';
import { PageAudit } from '../../../libs/database/src/entities/page-audit.entity';
import { AuditHistory } from '../../../libs/database/src/entities/audit-history.entity';
import { AccessibilityIssue } from '../../../libs/database/src/entities/accessibility-issue.entity';
import { Screenshot } from '../../../libs/database/src/entities/screenshot.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    DatabaseModule,
    TypeOrmModule.forFeature([WebsiteAudit, PageAudit, AuditHistory, AccessibilityIssue, Screenshot]),
    QueuesModule,
    AuthModule,
  ],
  controllers: [CrawlerServiceController, QueueCleanupController],
  providers: [
    WebsiteAuditService, 
    LinkExtractorService, 
    CrawlerService, 
    CrawlWorker,
    SitemapParserService,
    RobotsTxtService
  ],
})
export class CrawlerServiceModule {}
