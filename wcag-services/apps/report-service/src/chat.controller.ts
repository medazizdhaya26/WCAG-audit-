import { Body, Controller, Get, Param, Post, Res, Header } from '@nestjs/common';
import type { Response } from 'express';
import { ChatService, ChatMessage } from './chat.service';
import { PdfReportService } from './pdf-report.service';

@Controller()
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly pdf: PdfReportService,
  ) {}

  // ── Chatbot d'accessibilité ───────────────────────────────────────────────
  @Get('chat/status')
  status() {
    return { mode: this.chat.mode, provider: this.chat.currentProvider };
  }

  @Get('chat/test')
  test() {
    return this.chat.testKey();
  }

  @Post('chat')
  async ask(
    @Body() body: { message: string; history?: ChatMessage[]; pageAuditId?: string },
  ) {
    return this.chat.chat(body.message, body.history ?? [], body.pageAuditId);
  }

  // ── Export PDF du rapport détaillé ────────────────────────────────────────
  @Get('website-audits/:id/report/pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="rapport-accessibilite.pdf"')
  async reportPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdf.generate(id);
    res.send(buffer);
  }
}
