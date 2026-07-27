import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { normalizeUrl, safeResolveUrl } from '../../../libs/common/src/url/url-utils';

@Injectable()
export class SitemapParserService {
  async parseSitemap(sitemapUrl: string): Promise<string[]> {
    const urls = new Set<string>();
    try {
      const res = await axios.get(sitemapUrl, {
        timeout: 30000,
        maxRedirects: 5,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        validateStatus: () => true,
      });

      if (res.status !== 200) return [];

      const $ = cheerio.load(res.data, { xmlMode: true });

      $('url > loc').each((_i, el) => {
        const loc = $(el).text().trim();
        if (loc) {
          try {
            urls.add(normalizeUrl(loc));
          } catch {
            // ignore invalid URLs
          }
        }
      });

      const sitemapLocs: string[] = [];
      $('sitemap > loc').each((_i, el) => {
        const loc = $(el).text().trim();
        if (loc) sitemapLocs.push(loc);
      });

      for (const sitemapLoc of sitemapLocs) {
        try {
          const childUrls = await this.parseSitemap(sitemapLoc);
          childUrls.forEach((url) => urls.add(url));
        } catch {
          // ignore failed child sitemaps
        }
      }
    } catch {
      // return empty on error
    }
    return [...urls];
  }

  async discoverSitemaps(rootUrl: string): Promise<string[]> {
    const sitemapPaths = [
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/sitemap/sitemap.xml',
      '/sitemap-index.xml',
    ];

    const sitemaps: string[] = [];
    for (const path of sitemapPaths) {
      try {
        const fullUrl = safeResolveUrl(rootUrl, path);
        if (fullUrl) {
          sitemaps.push(fullUrl);
        }
      } catch {
        // ignore invalid paths
      }
    }

    return sitemaps;
  }
}
