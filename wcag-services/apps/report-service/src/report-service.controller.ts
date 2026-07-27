import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { ReportServiceService } from './report-service.service';
import { AuditReport } from './entities/audit-report.entity';

@Controller('reports')
export class ReportServiceController {
  constructor(private readonly reportService: ReportServiceService) {}

  @Get()
  async findAll(): Promise<AuditReport[]> {
    return this.reportService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<AuditReport | null> {
    return this.reportService.findOne(id);
  }

  @Post()
  async create(@Body() reportData: Partial<AuditReport>): Promise<AuditReport> {
    return this.reportService.create(reportData);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return this.reportService.remove(id);
  }
}
