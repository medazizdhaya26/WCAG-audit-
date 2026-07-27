import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
import { WebsiteAudit } from '../../../libs/database/src/entities/website-audit.entity';
import { PageAudit } from '../../../libs/database/src/entities/page-audit.entity';
import { ChatService } from './chat.service';

// ── Palette WEB4ALL (identique au site : crème / vert / néon / rose) ────────
const C = {
  primary: '#15241B',      // vert foncé (accent principal, remplace le violet)
  primaryLight: '#2E4034', // vert doux
  accentBg: '#F3F0E8',     // crème (fond des cartes)
  ink: '#15241B',          // texte principal
  sub: '#6B7A70',          // texte secondaire
  line: '#E3DFD3',         // bordures
  white: '#FFFFFF',
  dark: '#15241B',         // fond couverture (vert foncé au lieu du bleu nuit)
  neon: '#D9F95F',         // jaune néon (accents)
  pink: '#F7C6D8',         // rose
  green: '#16A34A',
  orange: '#F59E0B',
  red: '#DC2626',
  blue: '#2563EB',
};

function scoreColor(s: number): string {
  if (s >= 90) return C.green;
  if (s >= 50) return C.orange;
  return C.red;
}

// ── Corrections hors-ligne par règle axe (repli sans IA) ────────────────────
const OFFLINE_FIX: Record<string, string> = {
  'image-alt': "Ajouter un attribut alt décrivant l'image. Exemple : <img src=\"logo.png\" alt=\"Logo de l'entreprise\">. Pour une image décorative : alt=\"\".",
  'input-image-alt': "Ajouter un alt sur le bouton image. Exemple : <input type=\"image\" src=\"go.png\" alt=\"Rechercher\">.",
  'label': "Associer un label au champ. Exemple : <label for=\"email\">Email</label><input id=\"email\"> ou aria-label=\"Email\".",
  'link-name': "Donner un texte accessible au lien. Exemple : <a href=\"/\"><img src=\"home.png\" alt=\"Accueil\"></a>.",
  'button-name': "Donner un nom accessible au bouton. Exemple : <button aria-label=\"Fermer\">×</button>.",
  'color-contrast': "Augmenter le contraste texte/fond pour atteindre au moins 4.5:1 (3:1 pour grand texte). Assombrir le texte ou éclaircir le fond.",
  'heading-order': "Respecter l'ordre des titres (ne pas sauter de niveau, ex. h2 → h4). Un seul h1 par page.",
  'html-has-lang': "Déclarer la langue du document : <html lang=\"fr\">.",
  'document-title': "Ajouter un titre unique et descriptif : <title>Nom de la page – Site</title>.",
  'frame-title': "Ajouter un title sur l'iframe : <iframe title=\"Carte\" ...>.",
  'landmark-one-main': "Définir un repère principal : <main>…</main> (un seul par page).",
  'region': "Englober le contenu dans des repères (header, nav, main, footer) pour structurer la page.",
  'aria-input-field-name': "Donner un nom au champ ARIA via aria-label ou aria-labelledby.",
  'aria-toggle-field-name': "Donner un nom au contrôle ARIA via aria-label ou aria-labelledby.",
  'list': "Utiliser des listes sémantiques : <ul><li>…</li></ul> au lieu de <div>.",
  'duplicate-id': "Rendre chaque id unique dans la page.",
};

function offlineFix(ruleId: string): string {
  return OFFLINE_FIX[ruleId] ?? "Consulter la documentation WCAG liée à cette règle pour appliquer la correction adaptée.";
}

@Injectable()
export class PdfReportService {
  constructor(
    @InjectRepository(WebsiteAudit) private readonly websiteAudits: Repository<WebsiteAudit>,
    @InjectRepository(PageAudit) private readonly pageAudits: Repository<PageAudit>,
    private readonly chat: ChatService,
  ) {}

  async generate(websiteAuditId: string): Promise<Buffer> {
    const audit = await this.websiteAudits.findOne({ where: { id: websiteAuditId } });
    if (!audit) throw new NotFoundException('WebsiteAudit not found');

    const pages = await this.pageAudits.find({
      where: { websiteAuditId },
      order: { depth: 'ASC', pageScore: 'ASC' },
      relations: { issues: true },
    });

    const wave = this.aggregateWave(pages);
    const waveDetails = this.aggregateWaveDetails(pages);
    const corrections = await this.buildCorrections(pages);
    const aiSummary = await this.buildAiSummary(audit, pages, wave);

    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    this.coverPage(doc, audit, pages);
    this.aiSummaryPage(doc, aiSummary);
    this.summaryPage(doc, audit, pages);
    this.wavePage(doc, wave, waveDetails);
    this.correctionsPage(doc, corrections);
    this.pagesDetail(doc, pages, corrections);
    this.addFooters(doc);

    doc.end();
    return done;
  }

  // ══ Agrégations ═══════════════════════════════════════════════════════════
  private aggregateWave(pages: PageAudit[]) {
    const t = { errors: 0, contrastErrors: 0, alerts: 0, features: 0, structure: 0, aria: 0 };
    for (const p of pages) {
      const s = (p.waveAnalysis as any)?.summary;
      if (!s) continue;
      t.errors += s.errors ?? 0;
      t.contrastErrors += s.contrastErrors ?? 0;
      t.alerts += s.alerts ?? 0;
      t.features += s.features ?? 0;
      t.structure += s.structure ?? 0;
      t.aria += s.aria ?? 0;
    }
    return t;
  }

  /** Détail WAVE : pour chaque catégorie, compte des messages distincts. */
  private aggregateWaveDetails(pages: PageAudit[]): Record<string, { label: string; count: number }[]> {
    const cats = ['errors', 'contrast', 'alerts', 'features', 'structure', 'aria'];
    const acc: Record<string, Map<string, number>> = {};
    for (const c of cats) acc[c] = new Map();
    for (const p of pages) {
      const categories = (p.waveAnalysis as any)?.categories;
      if (!categories) continue;
      for (const c of cats) {
        for (const item of categories[c] ?? []) {
          const key = item.message || item.type || item.label || '—';
          acc[c].set(key, (acc[c].get(key) ?? 0) + 1);
        }
      }
    }
    const out: Record<string, { label: string; count: number }[]> = {};
    for (const c of cats) {
      out[c] = [...acc[c].entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
    }
    return out;
  }

  // ══ Corrections (IA en un seul appel, repli hors-ligne) ═══════════════════
  private async buildCorrections(pages: PageAudit[]): Promise<{ ruleId: string; help: string; helpUrl?: string | null; fix: string; count: number }[]> {
    const unique = new Map<string, { help: string; description: string; helpUrl?: string | null; html?: string; count: number }>();
    for (const p of pages) {
      for (const i of p.issues ?? []) {
        const ex = unique.get(i.ruleId);
        if (ex) ex.count += 1;
        else {
          const html = (i.details as any)?.[0]?.html;
          unique.set(i.ruleId, { help: i.help, description: i.description, helpUrl: i.helpUrl, html, count: 1 });
        }
      }
    }
    const rules = [...unique.keys()];
    const aiMap: Record<string, string> = {};

    if (rules.length) {
      const prompt = [
        "Tu es expert WCAG. Pour CHAQUE règle ci-dessous, donne une correction concrète en français :",
        "2 phrases d'explication + un exemple de code HTML corrigé.",
        "Format STRICT obligatoire : pour chaque règle, une ligne exactement `@@ruleId@@` puis la correction en dessous.",
        "",
        ...rules.map((r) => `- ${r} : ${unique.get(r)!.help}`),
      ].join('\n');

      const ai = await this.chat.generateText(prompt);
      if (ai) {
        const re = /@@\s*([\w-]+)\s*@@/g;
        const ids = [...ai.matchAll(re)].map((m) => m[1]);
        const parts = ai.split(/@@\s*[\w-]+\s*@@/);
        ids.forEach((id, idx) => {
          const txt = (parts[idx + 1] || '').trim();
          if (txt) aiMap[id] = txt;
        });
      }
    }

    return rules.map((r) => ({
      ruleId: r,
      help: unique.get(r)!.help,
      helpUrl: unique.get(r)!.helpUrl,
      fix: aiMap[r] || offlineFix(r),
      count: unique.get(r)!.count,
    })).sort((a, b) => b.count - a.count);
  }

  private async buildAiSummary(audit: WebsiteAudit, pages: PageAudit[], wave: ReturnType<typeof this.aggregateWave>): Promise<string> {
    const impact = { CRITICAL: 0, SERIOUS: 0, MODERATE: 0, MINOR: 0 } as Record<string, number>;
    for (const p of pages) for (const i of p.issues ?? []) impact[i.impact] = (impact[i.impact] ?? 0) + 1;

    const prompt = [
      `Rédige en français un résumé exécutif d'audit d'accessibilité web (WCAG) pour ${audit.rootUrl}.`,
      `Score global : ${Math.round(audit.globalScore ?? 0)}/100. Pages : ${audit.pagesCompleted}.`,
      `Sévérité : critiques ${impact.CRITICAL}, sérieuses ${impact.SERIOUS}, modérées ${impact.MODERATE}, mineures ${impact.MINOR}.`,
      `Analyse : ${wave.errors} erreurs, ${wave.contrastErrors} contrastes, ${wave.alerts} alertes.`,
      `Donne : un paragraphe de synthèse, 3 à 5 priorités, une conclusion. Texte simple, pas de markdown.`,
    ].join('\n');

    const ai = await this.chat.generateText(prompt);
    if (ai) return ai;

    const score = Math.round(audit.globalScore ?? 0);
    return [
      `Le site ${audit.rootUrl} obtient un score global de ${score}/100 sur ${audit.pagesCompleted} page(s).`,
      '',
      `${impact.CRITICAL} violation(s) critique(s), ${impact.SERIOUS} sérieuse(s), ${impact.MODERATE} modérée(s), ${impact.MINOR} mineure(s) ont été relevées.`,
      '',
      'Priorités : 1) violations critiques et sérieuses, 2) contrastes, 3) textes alternatifs et labels, 4) structure et ARIA.',
      '',
      `Conclusion : une correction progressive en partant des pages les moins accessibles permet d'atteindre le niveau WCAG AA.`,
      '',
      '(Résumé généré sans IA — ajoutez une clé API pour un texte personnalisé.)',
    ].join('\n');
  }

  // ══ Rendu ═════════════════════════════════════════════════════════════════
  private coverPage(doc: PDFKit.PDFDocument, audit: WebsiteAudit, pages: PageAudit[]) {
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(C.dark);
    // bande + cercles décoratifs (accents néon/rose comme le site)
    doc.rect(0, 0, 10, doc.page.height).fill(C.neon);
    doc.circle(doc.page.width - 60, 120, 140).fillOpacity(0.12).fill(C.neon).fillOpacity(1);
    doc.circle(90, doc.page.height - 90, 90).fillOpacity(0.10).fill(C.pink).fillOpacity(1);

    doc.fillColor(C.neon).fontSize(13).font('Helvetica-Bold').text('WEB4ALL', 60, 90, { characterSpacing: 3 });
    doc.fillColor(C.pink).fontSize(11).font('Helvetica').text("RAPPORT D'ACCESSIBILITÉ WCAG", 60, 110, { characterSpacing: 2 });

    doc.fillColor(C.white).fontSize(34).font('Helvetica-Bold').text('Audit d\'accessibilité', 60, 250, { width: 460 });
    doc.fillColor(C.neon).fontSize(15).font('Helvetica').text(audit.rootUrl, 60, 300, { width: 460 });

    // carte score
    const score = Math.round(audit.globalScore ?? 0);
    doc.roundedRect(60, 370, 230, 120, 14).fill(C.primaryLight);
    doc.fillColor(C.pink).fontSize(10).font('Helvetica-Bold').text('SCORE GLOBAL', 80, 392, { characterSpacing: 1 });
    doc.fillColor(scoreColor(score)).fontSize(56).font('Helvetica-Bold').text(`${score}`, 80, 408);
    doc.fillColor(C.white).fontSize(16).font('Helvetica').text('/100', 175, 440);

    const totalIssues = pages.reduce((n, p) => n + (p.issues?.length ?? 0), 0);
    doc.roundedRect(305, 370, 230, 120, 14).fill(C.primaryLight);
    doc.fillColor(C.pink).fontSize(10).font('Helvetica-Bold').text('VIOLATIONS', 325, 392, { characterSpacing: 1 });
    doc.fillColor(C.neon).fontSize(56).font('Helvetica-Bold').text(`${totalIssues}`, 325, 408);
    doc.fillColor(C.white).fontSize(11).font('Helvetica').text(`sur ${audit.pagesCompleted} page(s)`, 325, 462);

    doc.fillColor(C.pink).fontSize(10).font('Helvetica');
    doc.text(`Date : ${new Date().toLocaleString('fr-FR')}`, 60, 740);
    doc.text(`ID : ${audit.id}`, 320, 740);
  }

  private header(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
    doc.rect(0, 0, doc.page.width, 78).fill(C.primary);
    doc.rect(0, 78, doc.page.width, 4).fill(C.neon);
    doc.fillColor(C.white).fontSize(18).font('Helvetica-Bold').text(title, 50, 26);
    if (subtitle) doc.fillColor(C.pink).fontSize(10).font('Helvetica').text(subtitle, 50, 52);
    doc.fillColor(C.neon).fontSize(10).font('Helvetica-Bold').text('WEB4ALL', 470, 30);
  }

  private aiSummaryPage(doc: PDFKit.PDFDocument, summary: string) {
    doc.addPage();
    this.header(doc, 'Analyse & recommandations', 'Synthèse générée à partir des résultats de l\'audit');
    doc.fillColor(C.ink).fontSize(11).font('Helvetica').text(summary, 50, 105, { width: 495, lineGap: 3, align: 'left' });
  }

  private summaryPage(doc: PDFKit.PDFDocument, audit: WebsiteAudit, pages: PageAudit[]) {
    doc.addPage();
    this.header(doc, 'Synthèse', 'Vue d\'ensemble et pages prioritaires');

    const impactCounts = { CRITICAL: 0, SERIOUS: 0, MODERATE: 0, MINOR: 0, UNKNOWN: 0 } as Record<string, number>;
    let totalIssues = 0;
    for (const p of pages) for (const i of p.issues ?? []) { impactCounts[i.impact] = (impactCounts[i.impact] ?? 0) + 1; totalIssues++; }

    let y = 105;
    const cards: [string, string | number, string][] = [
      ['Pages analysées', audit.pagesCompleted, C.primary],
      ['Violations', totalIssues, C.red],
      ['Score', `${Math.round(audit.globalScore ?? 0)}`, scoreColor(Math.round(audit.globalScore ?? 0))],
    ];
    let x = 50;
    for (const [label, value, color] of cards) {
      doc.roundedRect(x, y, 155, 66, 10).fill(C.accentBg);
      doc.fillColor(color).fontSize(26).font('Helvetica-Bold').text(String(value), x + 14, y + 12);
      doc.fillColor(C.sub).fontSize(9).font('Helvetica-Bold').text(label.toUpperCase(), x + 14, y + 46, { characterSpacing: 0.5 });
      x += 168;
    }

    y += 100;
    doc.fillColor(C.ink).fontSize(13).font('Helvetica-Bold').text('Violations par sévérité', 50, y);
    y += 26;
    const sevColors: Record<string, string> = { CRITICAL: C.red, SERIOUS: C.orange, MODERATE: '#CA8A04', MINOR: C.blue, UNKNOWN: C.sub };
    const maxCount = Math.max(1, ...Object.values(impactCounts));
    for (const [sev, count] of Object.entries(impactCounts)) {
      doc.fillColor(C.ink).fontSize(10).font('Helvetica').text(sev, 50, y + 3, { width: 80 });
      const barW = (count / maxCount) * 320;
      doc.roundedRect(140, y, Math.max(barW, 2), 13, 3).fill(sevColors[sev]);
      doc.fillColor(C.ink).fontSize(10).font('Helvetica-Bold').text(String(count), 140 + Math.max(barW, 2) + 6, y + 1);
      y += 23;
    }

    y += 18;
    doc.fillColor(C.ink).fontSize(13).font('Helvetica-Bold').text('Pages les moins accessibles', 50, y);
    y += 24;
    for (const p of [...pages].sort((a, b) => (a.pageScore ?? 0) - (b.pageScore ?? 0)).slice(0, 8)) {
      const s = Math.round(p.pageScore ?? 0);
      doc.roundedRect(50, y - 2, 34, 18, 4).fill(scoreColor(s));
      doc.fillColor(C.white).fontSize(10).font('Helvetica-Bold').text(`${s}`, 50, y + 2, { width: 34, align: 'center' });
      doc.fillColor(C.ink).fontSize(10).font('Helvetica').text(p.url, 94, y + 2, { width: 410, ellipsis: true });
      y += 22;
    }
  }

  private wavePage(doc: PDFKit.PDFDocument, wave: ReturnType<typeof this.aggregateWave>, details: Record<string, { label: string; count: number }[]>) {
    doc.addPage();
    this.header(doc, 'Analyse visuelle', 'Répartition par catégorie (cumul sur toutes les pages)');

    const cats: [string, string, number, { label: string; count: number }[]][] = [
      ['Erreurs', C.red, wave.errors, details['errors']],
      ['Contraste', '#334155', wave.contrastErrors, details['contrast']],
      ['Alertes', C.orange, wave.alerts, details['alerts']],
      ['Fonctionnalités', C.green, wave.features, details['features']],
      ['Structure', C.blue, wave.structure, details['structure']],
      ['ARIA', '#9333EA', wave.aria, details['aria']],
    ];

    let y = 100;
    for (const [label, color, count, items] of cats) {
      if (y > 690) { doc.addPage(); this.header(doc, 'Analyse visuelle (suite)'); y = 100; }
      // en-tête catégorie
      doc.roundedRect(50, y, 495, 26, 6).fill(color);
      doc.fillColor(C.white).fontSize(12).font('Helvetica-Bold').text(label, 62, y + 7);
      doc.fillColor(C.white).fontSize(12).font('Helvetica-Bold').text(String(count), 50, y + 7, { width: 483, align: 'right' });
      y += 32;
      // détails
      if (!items || items.length === 0) {
        doc.fillColor(C.sub).fontSize(9).font('Helvetica-Oblique').text('Aucun élément.', 62, y);
        y += 16;
      } else {
        for (const it of items) {
          doc.fillColor(C.ink).fontSize(9).font('Helvetica').text(`• ${it.label}`, 62, y, { width: 430, ellipsis: true });
          doc.fillColor(C.sub).fontSize(9).font('Helvetica-Bold').text(`×${it.count}`, 500, y, { width: 45, align: 'right' });
          y += 15;
        }
      }
      y += 12;
    }
  }

  private correctionsPage(doc: PDFKit.PDFDocument, corrections: { ruleId: string; help: string; helpUrl?: string | null; fix: string; count: number }[]) {
    doc.addPage();
    this.header(doc, 'Guide de corrections', 'Comment corriger chaque type de faute détectée');

    let y = 100;
    for (const c of corrections) {
      const fixHeight = doc.heightOfString(c.fix, { width: 470, lineGap: 2 });
      const blockH = 56 + fixHeight;
      if (y + blockH > 760) { doc.addPage(); this.header(doc, 'Guide de corrections (suite)'); y = 100; }

      doc.roundedRect(50, y, 495, blockH, 8).fill(C.accentBg);
      // titre règle + nb occurrences
      doc.fillColor(C.primary).fontSize(11).font('Helvetica-Bold').text(c.ruleId, 64, y + 12, { width: 380 });
      doc.roundedRect(470, y + 10, 62, 16, 8).fill(C.primary);
      doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text(`${c.count}×`, 470, y + 14, { width: 62, align: 'center' });
      // problème
      doc.fillColor(C.sub).fontSize(9).font('Helvetica-Oblique').text(c.help, 64, y + 30, { width: 466 });
      // correction
      doc.fillColor(C.ink).fontSize(9.5).font('Helvetica').text(c.fix, 64, y + 48, { width: 466, lineGap: 2 });
      y += blockH + 12;
    }
  }

  private pagesDetail(doc: PDFKit.PDFDocument, pages: PageAudit[], corrections: { ruleId: string; fix: string }[]) {
    const fixByRule = new Map(corrections.map((c) => [c.ruleId, c.fix]));
    for (const p of pages) {
      if ((p.issues?.length ?? 0) === 0) continue;
      doc.addPage();
      const s = Math.round(p.pageScore ?? 0);
      this.header(doc, 'Détail de la page', `${p.issues.length} violation(s)`);

      doc.fillColor(C.ink).fontSize(10).font('Helvetica-Bold').text(p.url, 50, 100, { width: 440 });
      doc.roundedRect(490, 96, 55, 20, 5).fill(scoreColor(s));
      doc.fillColor(C.white).fontSize(11).font('Helvetica-Bold').text(`${s}`, 490, 100, { width: 55, align: 'center' });

      let y = 135;
      for (const i of p.issues) {
        const fix = fixByRule.get(i.ruleId) ?? '';
        const fixH = fix ? doc.heightOfString(fix, { width: 470 }) : 0;
        const helpH = doc.heightOfString(i.help, { width: 470 });
        const blockH = 28 + helpH + (fix ? fixH + 16 : 0);
        if (y + blockH > 770) { doc.addPage(); this.header(doc, 'Détail (suite)'); y = 100; }

        const sevColor = i.impact === 'CRITICAL' ? C.red : i.impact === 'SERIOUS' ? C.orange : i.impact === 'MODERATE' ? '#CA8A04' : C.blue;
        doc.roundedRect(50, y, 66, 15, 3).fill(sevColor);
        doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold').text(i.impact, 50, y + 4, { width: 66, align: 'center' });
        doc.fillColor(C.ink).fontSize(10).font('Helvetica-Bold').text(i.ruleId, 124, y + 2, { width: 410 });
        y += 20;
        doc.fillColor(C.ink).fontSize(9).font('Helvetica').text(i.help, 50, y, { width: 495 });
        y = doc.y + 4;
        if (fix) {
          doc.roundedRect(50, y, 495, fixH + 14, 6).fill('#ECFDF5');
          doc.fillColor(C.green).fontSize(8).font('Helvetica-Bold').text('CORRECTION', 60, y + 5);
          doc.fillColor(C.ink).fontSize(8.5).font('Helvetica').text(fix, 60, y + 16, { width: 475 });
          y += fixH + 22;
        }
        doc.moveTo(50, y).lineTo(545, y).lineWidth(0.5).strokeColor(C.line).stroke();
        y += 12;
      }
    }
  }

  private addFooters(doc: PDFKit.PDFDocument) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(C.sub).fontSize(8).font('Helvetica')
        .text(`WEB4ALL — Rapport d'accessibilité  •  Page ${i + 1}/${range.count}`, 50, doc.page.height - 32, {
          width: doc.page.width - 100, align: 'center',
        });
    }
  }
}
