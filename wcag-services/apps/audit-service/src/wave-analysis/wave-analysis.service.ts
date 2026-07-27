import { Injectable } from '@nestjs/common';
import { Page } from 'playwright';
import { WaveAnalysisResult, WaveCategory, WaveResult, WaveSeverity, WaveSummary } from './wave.types';
import { AxeToWaveMapper } from './axe-to-wave.mapper';

@Injectable()
export class WaveAnalysisService {
  async analyzePage(page: Page, axeRaw: any): Promise<WaveAnalysisResult> {
    const waveResults: WaveResult[] = [];

    // 1) Erreurs / contraste / alertes issues d'axe (avec selector)
    if (axeRaw?.violations) {
      waveResults.push(...AxeToWaveMapper.mapViolations(axeRaw.violations));
    }

    // 2) Résoudre la position (boundingBox absolu document) de ces éléments par selector
    await this.resolvePositions(page, waveResults);

    // 3) Catégories basées sur le DOM (features / structure / aria), AVEC positions + labels
    const domResults = await this.collectDomResults(page);
    waveResults.push(...domResults);

    const categorized = this.groupByCategory(waveResults);
    const summary = this.calculateSummary(categorized);

    return { summary, categories: categorized };
  }

  /** Attache à chaque résultat (qui a un selector) sa boundingBox absolue (coords document). */
  private async resolvePositions(page: Page, results: WaveResult[]): Promise<void> {
    const selectors = results.map((r) => r.selector ?? null);
    if (selectors.length === 0) return;

    let rects: (null | { x: number; y: number; width: number; height: number })[] = [];
    try {
      rects = await page.evaluate((sels: (string | null)[]) => {
        return sels.map((sel) => {
          if (!sel) return null;
          try {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
              x: r.left + window.scrollX,
              y: r.top + window.scrollY,
              width: r.width,
              height: r.height,
            };
          } catch {
            return null;
          }
        });
      }, selectors);
    } catch {
      rects = [];
    }

    results.forEach((r, i) => {
      if (rects[i]) r.boundingBox = rects[i] as any;
    });
  }

  /**
   * Énumère dans la page chaque élément de structure / feature / aria,
   * et renvoie un WaveResult positionné (coords absolues document) + label court.
   */
  private async collectDomResults(page: Page): Promise<WaveResult[]> {
    let raw: any[] = [];
    try {
      raw = await page.evaluate(() => {
        const out: any[] = [];
        const rectOf = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
        };
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const push = (category: string, type: string, label: string, message: string, el: Element) => {
          if (!visible(el)) return;
          out.push({ category, type, label, message, boundingBox: rectOf(el) });
        };
        const cap = (list: NodeListOf<Element>, n = 80) => Array.from(list).slice(0, n);

        // ── STRUCTURE : titres ──────────────────────────────────────────
        (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).forEach((tag) => {
          cap(document.querySelectorAll(tag)).forEach((el) =>
            push('structure', `heading-${tag}`, tag.toUpperCase(), `Titre ${tag.toUpperCase()}`, el),
          );
        });
        // ── STRUCTURE : repères ─────────────────────────────────────────
        cap(document.querySelectorAll('nav')).forEach((el) => push('structure', 'navigation', 'NAV', 'Navigation', el));
        cap(document.querySelectorAll('header')).forEach((el) => push('structure', 'header', 'HDR', 'En-tête', el));
        cap(document.querySelectorAll('footer')).forEach((el) => push('structure', 'footer', 'FT', 'Pied de page', el));
        cap(document.querySelectorAll('main')).forEach((el) => push('structure', 'main', 'MAIN', 'Contenu principal', el));
        cap(document.querySelectorAll('ul,ol')).forEach((el) => push('structure', 'list', 'LIST', 'Liste', el));

        // ── FEATURES : images avec alt, labels de formulaire ────────────
        cap(document.querySelectorAll('img[alt]')).forEach((el) => {
          const alt = (el as HTMLImageElement).alt;
          if (alt && alt.trim()) push('features', 'image-alt', 'ALT', `Texte alternatif : "${alt}"`, el);
        });
        cap(document.querySelectorAll('label')).forEach((el) => push('features', 'form-label', 'LBL', 'Étiquette de formulaire', el));

        // ── ARIA ────────────────────────────────────────────────────────
        cap(document.querySelectorAll('[aria-label]')).forEach((el) =>
          push('aria', 'aria-label', 'ARIA', `aria-label : "${el.getAttribute('aria-label')}"`, el),
        );
        cap(document.querySelectorAll('[role]')).forEach((el) =>
          push('aria', 'role', 'ROLE', `role : "${el.getAttribute('role')}"`, el),
        );
        cap(document.querySelectorAll('[tabindex]')).forEach((el) =>
          push('aria', 'tabindex', 'TAB', `tabindex : "${el.getAttribute('tabindex')}"`, el),
        );

        // ── ALERTS : plusieurs H1 ───────────────────────────────────────
        const h1s = document.querySelectorAll('h1');
        if (h1s.length > 1) {
          cap(h1s).forEach((el) => push('alerts', 'multiple-h1', '!', 'Plusieurs titres H1 sur la page', el));
        }

        return out;
      });
    } catch {
      raw = [];
    }

    return raw.map((r) => ({
      category: r.category as WaveCategory,
      type: r.type,
      label: r.label,
      severity: r.category === 'alerts' ? WaveSeverity.MEDIUM : WaveSeverity.INFO,
      message: r.message,
      boundingBox: r.boundingBox,
    }));
  }

  private groupByCategory(results: WaveResult[]): Record<WaveCategory, WaveResult[]> {
    const grouped: Record<WaveCategory, WaveResult[]> = {
      [WaveCategory.ERRORS]: [],
      [WaveCategory.CONTRAST]: [],
      [WaveCategory.ALERTS]: [],
      [WaveCategory.FEATURES]: [],
      [WaveCategory.STRUCTURE]: [],
      [WaveCategory.ARIA]: [],
    };
    for (const result of results) {
      grouped[result.category]?.push(result);
    }
    return grouped;
  }

  private calculateSummary(categorized: Record<WaveCategory, WaveResult[]>): WaveSummary {
    let totalPenalty = 0;
    for (const result of categorized.errors) totalPenalty += AxeToWaveMapper.getSeverityWeight(result.severity);
    for (const result of categorized.contrast) totalPenalty += AxeToWaveMapper.getSeverityWeight(result.severity);
    for (const result of categorized.alerts) totalPenalty += AxeToWaveMapper.getSeverityWeight(result.severity) * 0.5;

    const score = Math.max(0, Math.min(10, 10 - totalPenalty / 10));

    return {
      errors: categorized.errors.length,
      contrastErrors: categorized.contrast.length,
      alerts: categorized.alerts.length,
      features: categorized.features.length,
      structure: categorized.structure.length,
      aria: categorized.aria.length,
      score: Math.round(score * 10) / 10,
    };
  }
}
