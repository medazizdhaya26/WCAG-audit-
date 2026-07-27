import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class RobotsTxtService {
  async parseRobotsTxt(robotsUrl: string): Promise<{
    allowedPaths: string[];
    disallowedPaths: string[];
    sitemaps: string[];
  }> {
    const result = {
      allowedPaths: ['/'],
      disallowedPaths: [] as string[],
      sitemaps: [] as string[],
    };

    try {
      const res = await axios.get(robotsUrl, {
        timeout: 10000,
        maxRedirects: 3,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        validateStatus: () => true,
      });

      if (res.status !== 200) return result;

      const lines = res.data.split('\n').map((l: string) => l.trim());

      let currentUserAgent = '*';

      for (const line of lines) {
        if (!line || line.startsWith('#')) continue;

        const lowerLine = line.toLowerCase();

        if (lowerLine.startsWith('user-agent:')) {
          currentUserAgent = line.split(':')[1]?.trim() || '*';
        } else if (lowerLine.startsWith('allow:') && currentUserAgent === '*') {
          const path = line.split(':')[1]?.trim() || '/';
          result.allowedPaths.push(path);
        } else if (lowerLine.startsWith('disallow:') && currentUserAgent === '*') {
          const path = line.split(':')[1]?.trim();
          if (path) {
            result.disallowedPaths.push(path);
          }
        } else if (lowerLine.startsWith('sitemap:')) {
          const sitemap = line.split(':')[1]?.trim();
          if (sitemap) {
            result.sitemaps.push(sitemap);
          }
        }
      }
    } catch {
      // return default if parsing fails
    }

    return result;
  }

  isUrlAllowed(url: string, disallowedPaths: string[]): boolean {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;

      for (const disallowed of disallowedPaths) {
        if (disallowed === '/') return false;
        if (path.startsWith(disallowed)) return false;
      }
      return true;
    } catch {
      return true;
    }
  }
}
