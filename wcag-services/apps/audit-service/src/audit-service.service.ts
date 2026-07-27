import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { chromium } from 'playwright';
import * as axe from 'axe-core';
import * as chromeLauncher from 'chrome-launcher';
import { firstValueFrom } from 'rxjs';
import { BrowserPoolService } from './playwright-browser-pool.service';
import { WaveAnalysisService } from './wave-analysis/wave-analysis.service';

const IMPACT_WEIGHT: Record<string, number> = { critical: 15, serious: 10, moderate: 5, minor: 2 };

@Injectable()
export class AuditServiceService {
  private readonly logger = new Logger(AuditServiceService.name);
  private readonly reportServiceUrl = process.env.REPORT_SERVICE_URL || 'http://localhost:3001/reports';

  constructor(
    private readonly httpService: HttpService,
    private readonly browserPool: BrowserPoolService,
    private readonly waveAnalysis: WaveAnalysisService,
  ) {}

  /** Rend un document HTML complet, lance axe + WAVE + screenshot, renvoie le résultat. */
  private async auditDocument(fullHtml: string) {
    const browser = await this.browserPool.getBrowser();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, bypassCSP: true });
    const page = await context.newPage();
    try {
      await page.setContent(fullHtml, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(400);

      await page.addScriptTag({ content: axe.source });
      const axeRaw: any = await page.evaluate(() => (window as any).axe.run());

      const waveAnalysisResult = await this.waveAnalysis.analyzePage(page, axeRaw);

      const shot = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 });
      const screenshot = `data:image/jpeg;base64,${shot.toString('base64')}`;

      const issues: any[] = [];
      let penalty = 0;
      for (const v of axeRaw.violations ?? []) {
        const details: any[] = [];
        for (const node of v.nodes ?? []) {
          let location: any = null;
          try {
            const el = await page.$(node.target?.[0]);
            location = (await el?.boundingBox()) || null;
          } catch { location = null; }
          details.push({ target: node.target ?? [], html: node.html ?? '', location });
        }
        penalty += (IMPACT_WEIGHT[v.impact] ?? 1);
        issues.push({
          id: v.id, ruleId: v.id,
          impact: (v.impact ?? 'minor').toUpperCase(),
          description: v.description, help: v.help, helpUrl: v.helpUrl,
          nodes: details.length, details,
        });
      }
      const pageScore = Math.max(0, Math.min(100, 100 - penalty));
      return { pageScore, issues, waveAnalysis: waveAnalysisResult, screenshot };
    } finally {
      await context.close().catch(() => {});
    }
  }

  /** Mode développeur : audite directement du code HTML/CSS/JS collé (sans URL, sans DB). */
  async runInlineAudit(input: { html?: string; css?: string; js?: string }) {
    const html = input.html ?? '';
    const css = input.css ?? '';
    const js = input.js ?? '';
    const fullHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>${css}</style></head><body>${html}<script>${js}<\/script></body></html>`;
    return this.auditDocument(fullHtml);
  }

  /** Détecte le framework d'un fichier uploadé. */
  private detectFramework(filename: string, content: string): string {
    const f = (filename || '').toLowerCase();
    if (f.endsWith('.vue')) return 'Vue';
    if (f.endsWith('.svelte')) return 'Svelte';
    if (/@Component\s*\(|\*ngIf|\*ngFor|\[\(?ngModel\)?\]/.test(content)) return 'Angular';
    if (f.endsWith('.jsx') || f.endsWith('.tsx') || /from\s+['"]react['"]|className=|useState\s*\(/.test(content)) return 'React';
    if (/<template[\s>]/.test(content) && /export\s+default/.test(content)) return 'Vue';
    if (/<!DOCTYPE|<html[\s>]/i.test(content)) return 'HTML';
    if (f.endsWith('.html') || f.endsWith('.htm')) return 'HTML';
    return 'HTML';
  }

  /** Extrait un bloc JSX équilibré après le premier `return (`. */
  private extractReturnBlock(src: string): string | null {
    const i = src.search(/return\s*\(/);
    if (i < 0) return null;
    const open = src.indexOf('(', i);
    let depth = 0;
    for (let k = open; k < src.length; k++) {
      if (src[k] === '(') depth++;
      else if (src[k] === ')') { depth--; if (depth === 0) return src.slice(open + 1, k); }
    }
    return null;
  }

  private jsxToHtml(jsx: string): string {
    return jsx
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')        // commentaires JSX
      .replace(/className=/g, 'class=')
      .replace(/htmlFor=/g, 'for=')
      .replace(/\{`([^`]*)`\}/g, '$1')             // {`texte`}
      .replace(/\{\s*['"]([^'"]*)['"]\s*\}/g, '$1') // {"texte"}
      .replace(/\{[^{}]*\}/g, '')                   // autres expressions {…}
      .trim();
  }

  /** Convertit le contenu d'un fichier framework en document HTML auditable. */
  private toAuditableDocument(framework: string, content: string): string {
    const wrap = (body: string, styles = '') =>
      `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>${styles}</style></head><body>${body}</body></html>`;

    const styleBlocks = (content.match(/<style[\s\S]*?>([\s\S]*?)<\/style>/gi) || [])
      .map((b) => b.replace(/<\/?style[^>]*>/gi, '')).join('\n');

    if (framework === 'HTML') {
      return /<html[\s>]/i.test(content) ? content : wrap(content);
    }
    if (framework === 'Vue' || framework === 'Svelte' || framework === 'Angular') {
      // Template Vue/Svelte/Angular : on prend le markup, on retire les scripts.
      let body = content;
      const tpl = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
      if (tpl) body = tpl[1];
      body = body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
      // attributs de binding -> on neutralise le préfixe pour garder le markup
      body = body.replace(/\s(v-[\w:.-]+|:[\w-]+|@[\w.-]+|\*ng[\w]+|\[\(?[\w.-]+\)?\])=("[^"]*"|'[^']*')/g, ' ');
      return wrap(body, styleBlocks);
    }
    if (framework === 'React') {
      const block = this.extractReturnBlock(content);
      const body = block ? this.jsxToHtml(block) : '';
      return wrap(body, styleBlocks);
    }
    return wrap(content);
  }

  /** Mode développeur : audit d'un fichier uploadé (détecte le framework, convertit, audite). */
  async runFileAudit(input: { filename?: string; content?: string }) {
    const filename = input.filename ?? 'fichier';
    const content = input.content ?? '';
    const framework = this.detectFramework(filename, content);
    const fullHtml = this.toAuditableDocument(framework, content);
    const result = await this.auditDocument(fullHtml);
    const note = framework === 'HTML'
      ? 'Audit complet du HTML rendu.'
      : `Framework ${framework} détecté : analyse du balisage extrait (best-effort, sans build).`;
    return { framework, note, filename, ...result };
  }

  async runAudit(url: string) {
    this.logger.log(`Starting audit for URL: ${url}`);
    let browser;
    try {
      let axeResults: any = null;
      let screenshotBase64: string | null = null;
      let violationsWithCoords: any[] = [];

      try {
        // 1. Try to run Axe-Core with Playwright
        browser = await chromium.launch({ 
          headless: true,
          args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-software-rasterizer',
            '--disable-gpu',
            '--ignore-certificate-errors',
            '--disable-blink-features=AutomationControlled'
          ]
        });
        const context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          bypassCSP: true,
          ignoreHTTPSErrors: true,
          viewport: { width: 1280, height: 720 }
        });
        
        // Add anti-detection scripts
        await context.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
          });
        });
        
        const page = await context.newPage();
        page.setDefaultNavigationTimeout(60000);
        page.setDefaultTimeout(60000);
        
        await page.goto(url, { 
          waitUntil: 'domcontentloaded', 
          timeout: 60000 
        });
        await page.waitForTimeout(3000);

        await page.evaluate(() => {
          if (typeof window['trustedTypes'] !== 'undefined' && !window['trustedTypes'].defaultPolicy) {
            window['trustedTypes'].createPolicy('default', {
              createHTML: (s) => s,
              createScriptURL: (s) => s,
              createScript: (s) => s,
            });
          }
        });

        await page.addScriptTag({ content: axe.source });
        axeResults = await page.evaluate(() => {
          // @ts-ignore
          return window.axe.run();
        });

        const screenshot = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 80 });
        screenshotBase64 = `data:image/jpeg;base64,${screenshot.toString('base64')}`;

        for (const violation of axeResults.violations) {
          const nodesWithCoords: any[] = [];
          for (const node of violation.nodes) {
            try {
              const selector = node.target[0];
              const element = await page.$(selector);
              const box = await element?.boundingBox();
              nodesWithCoords.push({
                ...node,
                location: box || null
              });
            } catch (e) {
              nodesWithCoords.push({ ...node, location: null });
            }
          }
          violationsWithCoords.push({
            ...violation,
            nodes: nodesWithCoords
          });
        }
      } catch (playwrightError) {
        this.logger.warn(`Playwright failed for ${url}, proceeding with Lighthouse only: ${playwrightError.message}`);
      } finally {
        if (browser) await browser.close();
      }

      // 2. Always run Lighthouse
      const lighthouseResult = await this.runLighthouse(url);

      // 3. Format results
      const violations = violationsWithCoords.length > 0 ? violationsWithCoords.map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        nodes: v.nodes.length,
        details: v.nodes.map(n => ({
          target: n.target,
          location: n.location,
          html: n.html
        }))
      })) : [];

      const auditData = {
        url,
        score: lighthouseResult.score,
        issues: violations,
        screenshot: screenshotBase64 || null,
        critical: violations.filter(v => v.impact === 'critical').length,
        serious: violations.filter(v => v.impact === 'serious').length,
        moderate: violations.filter(v => v.impact === 'moderate').length,
      };

      // 4. Send to Report Service
      const response = await firstValueFrom(
        this.httpService.post(this.reportServiceUrl, auditData)
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Audit failed for ${url}: ${error.message}`);
      throw error;
    }
  }

  private async runLighthouse(url: string) {
    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'] });
    
    // Lighthouse is ESM, we use dynamic import
    const { default: lighthouse } = await import('lighthouse');
    
    const options = {
      logLevel: 'info' as const,
      output: 'json' as const,
      onlyCategories: ['accessibility'],
      port: chrome.port,
    };

    const runnerResult = await lighthouse(url, options);
    if (!runnerResult) {
      throw new Error('Lighthouse failed to run');
    }
    const score = (runnerResult.lhr.categories.accessibility?.score || 0) * 100;

    await chrome.kill();
    return { score };
  }
}
