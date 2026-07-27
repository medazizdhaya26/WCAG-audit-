import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '../../../libs/database/src/database.module';
import { QueuesModule } from '../../../libs/queues/src/queues.module';
import { AuthModule } from '../../../libs/auth/src/auth.module';
import { ReportServiceController } from './report-service.controller';
import { ReportServiceService } from './report-service.service';
import { WebsiteAuditReportController } from './website-audit-report.controller';
import { WebsiteAuditReportService } from './website-audit-report.service';
import { ReportWorker } from './workers/report.worker';
import { ExportService } from './export.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PdfReportService } from './pdf-report.service';
import { WebsiteAudit } from '../../../libs/database/src/entities/website-audit.entity';
import { PageAudit } from '../../../libs/database/src/entities/page-audit.entity';
import { AccessibilityIssue } from '../../../libs/database/src/entities/accessibility-issue.entity';
import { Screenshot } from '../../../libs/database/src/entities/screenshot.entity';
import { AuditHistory } from '../../../libs/database/src/entities/audit-history.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    TypeOrmModule.forFeature([WebsiteAudit, PageAudit, AccessibilityIssue, Screenshot, AuditHistory]),
    QueuesModule,
    AuthModule,
  ],
  controllers: [WebsiteAuditReportController, ReportServiceController, ChatController],
  providers: [WebsiteAuditReportService, ReportServiceService, ReportWorker, ExportService, ChatService, PdfReportService],
})
export class ReportServiceModule {}
