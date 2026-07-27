import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import * as axe from 'axe-core';
import * as chromeLauncher from 'chrome-launcher';
import { createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { BrowserPoolService } from './playwright-browser-pool.service';
import { EnhancedScoringService } from './enhanced-scoring.service';
import { WaveAnalysisService } from './wave-analysis/wave-analysis.service';
import { QUEUE_NAMES } from '../../../libs/queues/src/queue.constants';
import { REDIS_CONNECTION } from '../../../libs/queues/src/redis.provider';
import { REPORT_QUEUE } from '../../../libs/queues/src/queues.module';
import { AccessibilityIssue } from '../../../libs/database/src/entities/accessibility-issue.entity';
import { AuditHistory } from '../../../libs/database/src/entities/audit-history.entity';
import { PageAudit } from '../../../libs/database/src/entities/page-audit.entity';
import { Screenshot } from '../../../libs/database/src/entities/screenshot.entity';
import { WebsiteAudit } from '../../../libs/database/src/entities/website-audit.entity';
import { IssueImpact, PageAuditStatus, WebsiteAuditStatus } from '../../../libs/database/src/entities/enums';

type PageAuditJobData = {
  websiteAuditId: string;
  pageAuditId: string;
  url: string;
};

function mapImpact(impact: unknown): IssueImpact {
  const normalized = (typeof impact === 'string' ? impact : '').toLowerCase();
  if (normalized === 'critical') return IssueImpact.CRITICAL;
  if (normalized === 'serious') return IssueImpact.SERIOUS;
  if (normalized === 'moderate') return IssueImpact.MODERATE;
  if (normalized === 'minor') return IssueImpact.MINOR;
  return IssueImpact.UNKNOWN;
}

function computePenalty(issues: Array<{ impact: IssueImpact; nodes: number }>): number {
  const weights: Record<IssueImpact, number> = {
    [IssueImpact.CRITICAL]: 5,
    [IssueImpact.SERIOUS]: 3,
    [IssueImpact.MODERATE]: 1.5,
    [IssueImpact.MINOR]: 0.5,
    [IssueImpact.UNKNOWN]: 1,
  };

  let penalty = 0;
  for (const issue of issues) {
    const w = weights[issue.impact] ?? 1;
    penalty += w * Math.max(1, issue.nodes);
  }
  return penalty;
}

function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function pageWeight(depth: number): number {
  return 1 / (depth + 1);
}

@Injectable()
export class PageAuditWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  // Verrou : un seul Lighthouse à la fois sur le Chrome partagé (évite les scores faux).
  private lighthouseLock: Promise<void> = Promise.resolve();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PageAudit) private readonly pageAudits: Repository<PageAudit>,
    @InjectRepository(WebsiteAudit) private readonly websiteAudits: Repository<WebsiteAudit>,
    @InjectRepository(AccessibilityIssue) private readonly issues: Repository<AccessibilityIssue>,
    @InjectRepository(Screenshot) private readonly screenshots: Repository<Screenshot>,
    @InjectRepository(AuditHistory) private readonly history: Repository<AuditHistory>,
    private readonly browserPool: BrowserPoolService,
    private readonly enhancedScoring: EnhancedScoringService,
    private readonly waveAnalysis: WaveAnalysisService,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
    @Inject(REPORT_QUEUE) private readonly reportQueue: Queue,
  ) {}

  onModuleInit() {
    // Défaut 1 : beaucoup de sites (anti-bot) coupent les connexions simultanées.
    // Augmentable via PAGE_AUDIT_WORKER_CONCURRENCY pour les sites tolérants.
    const concurrency = Number(process.env.PAGE_AUDIT_WORKER_CONCURRENCY ?? '1');
    this.worker = new Worker(
      QUEUE_NAMES.PAGE_AUDIT,
      async (job: Job<PageAuditJobData>) => this.handleJob(job),
      { connection: this.redis, concurrency },
    );
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  private async handleJob(job: Job<PageAuditJobData>) {
    console.log(`[AUDIT-WORKER] Starting job for page: ${job.data.url}`);
    console.log(`[AUDIT-WORKER] Job data:`, job.data);
    
    if (job.name !== 'audit-page') return;

    const { websiteAuditId, pageAuditId, url } = job.data;

    // Check if page audit exists
    const existingPageAudit = await this.pageAudits.findOne({ where: { id: pageAuditId } });
    if (!existingPageAudit) {
      console.warn(`[AUDIT-WORKER] Page audit not found for ID: ${pageAuditId} - skipping job`);
      return;
    }

    await this.pageAudits.update({ id: pageAuditId }, { status: PageAuditStatus.RUNNING, startedAt: new Date() });

    try {
      console.log(`[AUDIT-WORKER] Running audit for URL: ${url}`);
      const result = await this.runAudit(url);

      // Si la page n'a pas chargé du tout → FAILED (ne pas l'enregistrer avec un score bidon de 100)
      if (!result.navigated) {
        console.warn(`[AUDIT-WORKER] Page non chargée → FAILED: ${url} (${result.navErrorMessage})`);
        await this.pageAudits.update(
          { id: pageAuditId },
          {
            status: PageAuditStatus.FAILED,
            finishedAt: new Date(),
            errorMessage: result.navErrorMessage ?? 'La page n\'a pas pu être chargée',
          },
        );
        await this.websiteAudits.increment({ id: websiteAuditId }, 'pagesFailed', 1);
        await this.tryFinalizeWebsiteAudit(websiteAuditId);
        return;
      }

      console.log(`[AUDIT-WORKER] Audit completed for URL: ${url}`);
      console.log(`[AUDIT-WORKER] Lighthouse score:`, result.lighthouseScore);
      console.log(`[AUDIT-WORKER] Page score:`, result.pageScore);
      console.log(`[AUDIT-WORKER] Number of issues:`, result.issues.length);
      console.log(`[AUDIT-WORKER] Axe raw results:`, result.axeRaw);
      console.log(`[AUDIT-WORKER] Wave analysis results:`, result.waveAnalysis);

      const issueEntities = result.issues
        .filter(i => i.ruleId)
        .map((i) => ({
          pageAuditId,
          tool: 'axe',
          ruleId: i.ruleId,
          impact: i.impact,
          description: i.description,
          help: i.help,
          helpUrl: i.helpUrl ?? null,
          nodes: i.nodes,
          details: i.details,
        }));

      const scoringResult = this.enhancedScoring.calculateScore(
        issueEntities as any,
        result.lighthouseScore,
      );
      console.log(`[AUDIT-WORKER] Scoring result:`, scoringResult);

      await this.dataSource.transaction(async (manager) => {
        await manager.delete(AccessibilityIssue, { pageAuditId });
        await manager.delete(Screenshot, { pageAuditId });

        await manager.update(
          PageAudit,
          { id: pageAuditId },
          {
            url,
            finalUrl: result.finalUrl,
            status: PageAuditStatus.COMPLETED,
            finishedAt: new Date(),
            lighthouseScore: result.lighthouseScore,
            pageScore: scoringResult.pageScore,
            categoryScores: scoringResult.categoryScores,
            wcagCompliance: scoringResult.wcagCompliance,
            issueBreakdown: scoringResult.issueBreakdown,
            axeRaw: result.axeRaw,
            waveAnalysis: result.waveAnalysis,
            html: result.html,
            title: result.title,
            httpStatus: result.httpStatus,
            errorMessage: null,
          },
        );

        if (result.screenshotBytes) {
          await manager.insert(Screenshot, {
            pageAuditId,
            mime: 'image/jpeg',
            data: Buffer.from(result.screenshotBytes),
          });
        }

        if (result.issues.length > 0) {
          await manager.insert(AccessibilityIssue, issueEntities);
        }
      });

      await this.websiteAudits.increment({ id: websiteAuditId }, 'pagesCompleted', 1);
      
      await this.tryFinalizeWebsiteAudit(websiteAuditId);
      console.log(`[AUDIT-WORKER] Job completed successfully for page: ${url}`);
    } catch (error: any) {
      console.error(`[AUDIT-WORKER] Error auditing page: ${url}`, error);
      await this.pageAudits.update(
        { id: pageAuditId },
        {
          status: PageAuditStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: error?.message ?? 'Unknown error',
        },
      );

      await this.websiteAudits.increment({ id: websiteAuditId }, 'pagesFailed', 1);
      
      await this.tryFinalizeWebsiteAudit(websiteAuditId);

      throw error;
    }
  }

  private async updateGlobalScore(websiteAuditId: string) {
    const pages = await this.pageAudits.find({
      where: { websiteAuditId },
      relations: { issues: true },
    });

    const scoredPages = pages.map((p) => {
      const score = clampScore(p.pageScore ?? p.lighthouseScore ?? 0);
      const isFailed = p.status === 'FAILED';
      const effectiveScore = isFailed ? 0 : score;
      return { id: p.id, url: p.url, depth: p.depth, status: p.status, score: effectiveScore, issues: p.issues };
    });

    let weightedSum = 0;
    let weightSum = 0;
    for (const p of scoredPages) {
      const w = pageWeight(p.depth);
      weightedSum += p.score * w;
      weightSum += w;
    }

    const globalScore = weightSum > 0 ? clampScore(weightedSum / weightSum) : 0;

    const impactCounts = { CRITICAL: 0, SERIOUS: 0, MODERATE: 0, MINOR: 0, UNKNOWN: 0 } as Record<string, number>;
    for (const p of scoredPages) {
      for (const issue of p.issues) {
        impactCounts[issue.impact] = (impactCounts[issue.impact] ?? 0) + 1;
      }
    }

    const worstPages = [...scoredPages]
      .sort((a, b) => a.score - b.score)
      .slice(0, 10)
      .map((p) => ({ id: p.id, url: p.url, depth: p.depth, score: p.score, status: p.status }));

    const summary = {
      totals: {
        pages: scoredPages.length,
        completed: scoredPages.filter((p) => p.status === 'COMPLETED').length,
        failed: scoredPages.filter((p) => p.status === 'FAILED').length,
        skipped: scoredPages.filter((p) => p.status === 'SKIPPED').length,
      },
      issues: impactCounts,
      worstPages,
    };

    await this.websiteAudits.update(
      { id: websiteAuditId },
      {
        globalScore,
        summary: summary as any,
      },
    );
  }

  private async tryFinalizeWebsiteAudit(websiteAuditId: string) {
    const audit = await this.websiteAudits.findOne({ where: { id: websiteAuditId } });
    if (!audit) return;
    if (audit.status !== WebsiteAuditStatus.AUDITING) return;

    const done = audit.pagesCompleted + audit.pagesFailed + audit.pagesSkipped;
    if (audit.pagesQueued > 0 && done >= audit.pagesQueued) {
      await this.updateGlobalScore(websiteAuditId);
      await this.websiteAudits.update({ id: websiteAuditId }, { 
        status: WebsiteAuditStatus.COMPLETED,
        finishedAt: new Date()
      });
    }
  }

  private async runAudit(url: string) {
    console.log(`[AUDIT-WORKER] === Starting runAudit for: ${url} ===`);
    
    const auditIssues: Array<{
      ruleId: string;
      impact: IssueImpact;
      description: string;
      help: string;
      helpUrl?: string;
      nodes: number;
      details: any;
    }> = [];

    let screenshotBytes: Uint8Array | null = null;
    let finalUrl = url;
    let httpStatus: number | null = null;
    let title: string | null = null;
    let axeRaw: any = null;
    let waveAnalysisResult: any = null;
    let htmlContent: string | null = null;
    let navigated = false; // la page a-t-elle réellement chargé ?
    let navErrorMessage: string | null = null;

    // Lighthouse est OPTIONNEL (désactivé par défaut) : il est instable (crash "Target closed",
    // NO_FCP) et double les connexions vers le site cible. Sans lui, le score se base sur Axe
    // (100 − pénalités), ce qui reflète directement les erreurs détectées.
    // Activer avec ENABLE_LIGHTHOUSE=true dans le .env.
    const lighthouseEnabled = process.env.ENABLE_LIGHTHOUSE === 'true';
    const lighthousePromise = lighthouseEnabled
      ? this.runLighthouse(url).catch(() => 0)
      : Promise.resolve(0);

    try {
      console.log(`[AUDIT-WORKER] Getting browser from pool...`);
      const browser = await this.browserPool.getBrowser();
      console.log(`[AUDIT-WORKER] Creating browser context...`);
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        ignoreHTTPSErrors: true,
        bypassCSP: true,
        viewport: { width: 1280, height: 720 },
      });
      console.log(`[AUDIT-WORKER] Creating new page...`);
      // Optimisation 1 : bloquer les ressources inutiles (images, vidéos, polices).
      // On GARDE le CSS car axe en a besoin pour le contraste des couleurs.
      await context.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (type === 'image' || type === 'media' || type === 'font') {
          route.abort().catch(() => {});
        } else {
          route.continue().catch(() => {});
        }
      });

      const page = await context.newPage();
      page.setDefaultNavigationTimeout(45000);
      page.setDefaultTimeout(45000);

      // Navigation avec nouvelles tentatives : certains serveurs ferment la connexion
      // (ERR_CONNECTION_CLOSED, anti-bot, HTTP/2 instable) — on réessaie.
      console.log(`[AUDIT-WORKER] Navigating to URL: ${url}`);
      let response: any = null;
      let lastErr: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          lastErr = null;
          break;
        } catch (e: any) {
          lastErr = e;
          console.warn(`[AUDIT-WORKER] goto tentative ${attempt}/3 échouée: ${e?.message}`);
          if (attempt === 2) {
            // Au 3e essai, on désactive le blocage de ressources (parfois la cause de la fermeture)
            await context.unroute('**/*').catch(() => {});
          }
          // Backoff progressif (le serveur throttle : on lui laisse respirer)
          if (attempt < 3) await page.waitForTimeout(attempt * 4000);
        }
      }
      if (!response) throw lastErr ?? new Error('Navigation échouée');

      httpStatus = response.status() ?? null;
      finalUrl = page.url();
      title = await page.title();
      navigated = true; // navigation réussie
      console.log(`[AUDIT-WORKER] Navigation complete. Final URL: ${finalUrl}, Status: ${httpStatus}, Title: ${title}`);

      // Attente FIABLE avant axe : il faut que la page (et les SPA) soient rendues,
      // sinon axe tourne trop tôt et rate des erreurs.
      // 1) état 'load' (CSS/ressources principales), plafonné
      await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
      // 2) réseau calme (contenu chargé dynamiquement), plafonné
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      // 3) s'assurer que le DOM a réellement du contenu (utile pour React/Vue)
      await page
        .waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 8000 })
        .catch(() => {});
      // 4) court délai de stabilisation pour les frameworks JS
      await page.waitForTimeout(800);

      await page.evaluate(() => {
        if (typeof window['trustedTypes'] !== 'undefined' && !window['trustedTypes'].defaultPolicy) {
          window['trustedTypes'].createPolicy('default', {
            createHTML: (s) => s,
            createScriptURL: (s) => s,
            createScript: (s) => s,
          });
        }
      });

      console.log(`[AUDIT-WORKER] Injecting axe-core...`);
      await page.addScriptTag({ content: axe.source });
      console.log(`[AUDIT-WORKER] Running axe-core audit...`);
      axeRaw = await page.evaluate(() => {
        return (window as any).axe.run();
      });
      console.log(`[AUDIT-WORKER] Axe-core completed. Violations: ${axeRaw.violations?.length || 0}, Passes: ${axeRaw.passes?.length || 0}`);

      console.log(`[AUDIT-WORKER] Running WAVE analysis...`);
      waveAnalysisResult = await this.waveAnalysis.analyzePage(page, axeRaw);
      console.log(`[AUDIT-WORKER] WAVE analysis complete:`, waveAnalysisResult);

      console.log(`[AUDIT-WORKER] Taking screenshot...`);
      const screenshot = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 });
      screenshotBytes = Uint8Array.from(screenshot);

      console.log(`[AUDIT-WORKER] Processing violations...`);
      for (const violation of axeRaw.violations ?? []) {
        const nodesWithCoords: any[] = [];
        for (const node of violation.nodes ?? []) {
          try {
            const selector = node.target?.[0];
            if (!selector) throw new Error('missing selector');
            const element = await page.$(selector);
            const box = await element?.boundingBox();
            nodesWithCoords.push({
              target: node.target,
              html: node.html,
              location: box || null,
            });
          } catch {
            nodesWithCoords.push({
              target: node.target ?? [],
              html: node.html ?? '',
              location: null,
            });
          }
        }

        auditIssues.push({
          ruleId: violation.id,
          impact: mapImpact(violation.impact),
          description: violation.description,
          help: violation.help,
          helpUrl: violation.helpUrl,
          nodes: nodesWithCoords.length,
          details: nodesWithCoords,
        });
      }
      console.log(`[AUDIT-WORKER] Processed ${auditIssues.length} violations`);

      // Capture du code HTML complet de la page rendue (pour la DB)
      try {
        htmlContent = await page.content();
      } catch {
        htmlContent = null;
      }

      console.log(`[AUDIT-WORKER] Closing context...`);
      await context.close();
    } catch (error: any) {
      console.error(`[AUDIT-WORKER] Error in Playwright phase: ${error?.message}`);
      navErrorMessage = error?.message ?? 'Erreur de navigation';
    }

    console.log(`[AUDIT-WORKER] Awaiting parallel Lighthouse...`);
    const lighthouseScore = await lighthousePromise;
    console.log(`[AUDIT-WORKER] Lighthouse score: ${lighthouseScore}`);
    
    const penalty = computePenalty(auditIssues.map((i) => ({ impact: i.impact, nodes: i.nodes })));
    const pageScore = clampScore(lighthouseScore - penalty);
    console.log(`[AUDIT-WORKER] Penalty: ${penalty}, Final page score: ${pageScore}`);

    console.log(`[AUDIT-WORKER] === runAudit complete for: ${url} ===`);
    
    return {
      navigated,
      navErrorMessage,
      finalUrl,
      httpStatus,
      title,
      lighthouseScore,
      pageScore,
      issues: auditIssues,
      screenshotBytes,
      axeRaw,
      waveAnalysis: waveAnalysisResult,
      html: htmlContent,
    };
  }

  private async runLighthouse(url: string): Promise<number> {
    // Sérialisation : on attend que le Lighthouse précédent finisse avant de lancer
    // le nôtre (le Chrome partagé ne supporte pas 2 Lighthouse simultanés → scores faux).
    let release!: () => void;
    const previous = this.lighthouseLock;
    this.lighthouseLock = new Promise<void>((r) => (release = r));
    await previous;

    // Chrome dédié et isolé pour Lighthouse = fiable (le partage du Chrome Playwright
    // donnait des scores faux ou 0). Sérialisé par le verrou : un seul à la fois.
    let chrome: chromeLauncher.LaunchedChrome | null = null;
    try {
      chrome = await chromeLauncher.launch({
        chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
      });

      console.log(`[AUDIT-WORKER] Running Lighthouse (Chrome dédié, port ${chrome.port})...`);
      const { default: lighthouse } = await import('lighthouse');
      const options = {
        logLevel: 'error' as const,
        output: 'json' as const,
        onlyCategories: ['accessibility'],
        port: chrome.port,
        maxWaitForLoad: 45000,
      };

      const runnerResult = await lighthouse(url, options);
      if (!runnerResult?.lhr) {
        console.log(`[AUDIT-WORKER] Lighthouse: aucun résultat pour ${url}`);
        return 0;
      }
      const cat = runnerResult.lhr.categories?.accessibility;
      if (cat?.score == null) {
        console.log(`[AUDIT-WORKER] Lighthouse: score null (runtimeError: ${runnerResult.lhr.runtimeError?.message ?? 'aucun'})`);
        return 0;
      }
      const score = cat.score * 100;
      console.log(`[AUDIT-WORKER] Lighthouse accessibility score: ${score}`);
      return score;
    } catch (error: any) {
      console.error(`[AUDIT-WORKER] Error in Lighthouse: ${error?.message}`);
      return 0;
    } finally {
      if (chrome) {
        try { await chrome.kill(); } catch { /* ignore */ }
      }
      release(); // libère le verrou pour le prochain Lighthouse
    }
  }
}
