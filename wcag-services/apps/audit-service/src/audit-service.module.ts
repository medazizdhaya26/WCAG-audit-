import { Module } from '@nestjs/common';
import { AuditServiceController } from './audit-service.controller';
import { AuditServiceService } from './audit-service.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '../../../libs/database/src/database.module';
import { QueuesModule } from '../../../libs/queues/src/queues.module';
import { AuthModule } from '../../../libs/auth/src/auth.module';
import { PageAuditWorker } from './page-audit.worker';
import { BrowserPoolService } from './playwright-browser-pool.service';
import { EnhancedScoringService } from './enhanced-scoring.service';
import { WaveAnalysisService } from './wave-analysis/wave-analysis.service';
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
    HttpModule,
    DatabaseModule,
    TypeOrmModule.forFeature([WebsiteAudit, PageAudit, AccessibilityIssue, Screenshot, AuditHistory]),
    QueuesModule,
    AuthModule,
  ],
  controllers: [AuditServiceController],
  providers: [AuditServiceService, BrowserPoolService, EnhancedScoringService, WaveAnalysisService, PageAuditWorker],
})
export class AuditServiceModule {}
