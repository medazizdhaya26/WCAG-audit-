import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { isInternalUrl, isProbablyStaticAsset, normalizeUrl, safeResolveUrl } from '../../../libs/common/src/url/url-utils';

export type ExtractLinksInput = {
  url: string;
  rootUrl: string;
  renderJs: boolean;
};

export type ExtractLinksResult = {
  finalUrl: string;
  normalizedFinalUrl: string;
  discoveredUrls: string[];
};

@Injectable()
export class LinkExtractorService {
  async extractLinks(input: ExtractLinksInput): Promise<ExtractLinksResult> {
    const root = new URL(input.rootUrl);

    const htmlResult = await this.tryHtmlFetchAndParse(input.url, root);
    if (htmlResult && (htmlResult.discoveredUrls.length > 0 || !input.renderJs)) {
      return htmlResult;
    }

    const renderedResult = await this.tryRenderAndExtract(input.url, root);
    if (renderedResult) return renderedResult;

    const fallbackFinal = normalizeUrl(input.url);
    return { finalUrl: fallbackFinal, normalizedFinalUrl: fallbackFinal, discoveredUrls: [] };
  }

  private async tryHtmlFetchAndParse(url: string, root: URL): Promise<ExtractLinksResult | null> {
    try {
      const res = await axios.get(url, {
        timeout: 20000,
        maxRedirects: 5,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        validateStatus: () => true,
      });

      const contentType = (res.headers['content-type'] ?? '').toString().toLowerCase();
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return null;

      const finalUrl = normalizeUrl((res.request?.res?.responseUrl as string) ?? url);
      const normalizedFinalUrl = normalizeUrl(finalUrl);

      const $ = cheerio.load(res.data ?? '');
      const hrefs = new Set<string>();
      $('a[href]').each((_i, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const resolved = safeResolveUrl(finalUrl, href);
        if (!resolved) return;
        hrefs.add(resolved);
      });

      const discoveredUrls = this.filterAndNormalize([...hrefs], root);
      return { finalUrl, normalizedFinalUrl, discoveredUrls };
    } catch {
      return null;
    }
  }

  private async tryRenderAndExtract(url: string, root: URL): Promise<ExtractLinksResult | null> {
    let browser: any;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(30000);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1000);

      const finalUrl = normalizeUrl(page.url());
      const normalizedFinalUrl = normalizeUrl(finalUrl);

      const rawHrefs = await page.$$eval('a[href]', (els) => els.map((a) => (a as HTMLAnchorElement).href));
      const discoveredUrls = this.filterAndNormalize(rawHrefs, root);

      return { finalUrl, normalizedFinalUrl, discoveredUrls };
    } catch {
      return null;
    } finally {
      if (browser) await browser.close();
    }
  }

  private filterAndNormalize(urls: string[], root: URL): string[] {
    const out = new Set<string>();
    for (const u of urls) {
      try {
        const parsed = new URL(u);
        if (!isInternalUrl(parsed, root)) continue;
        if (isProbablyStaticAsset(parsed)) continue;
        out.add(normalizeUrl(parsed.toString()));
      } catch {
        continue;
      }
    }
    return [...out];
  }
}

