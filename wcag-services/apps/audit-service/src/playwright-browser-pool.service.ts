import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Browser, chromium } from 'playwright';

@Injectable()
export class BrowserPoolService implements OnModuleDestroy {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  // Port CDP partagé : Playwright ET Lighthouse utilisent le même Chrome.
  readonly debugPort = Number(process.env.CHROME_DEBUG_PORT ?? '9222');

  async getBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    if (this.launching) return this.launching;

    // Proxy optionnel (PROXY_URL) : nécessaire pour Chromium afin que le proxy par contexte
    // soit pris en compte. Ex. http://user:pass@host:port
    const proxyUrl = (process.env.PROXY_URL ?? '').trim();
    let launchProxy: { server: string; username?: string; password?: string } | undefined;
    if (proxyUrl) {
      try {
        const u = new URL(proxyUrl);
        launchProxy = { server: `${u.protocol}//${u.host}` };
        if (u.username) launchProxy.username = decodeURIComponent(u.username);
        if (u.password) launchProxy.password = decodeURIComponent(u.password);
      } catch {
        launchProxy = { server: proxyUrl };
      }
    }

    this.launching = chromium.launch({
      headless: true,
      ...(launchProxy ? { proxy: launchProxy } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--ignore-certificate-errors',
        // Expose le port de debug pour que Lighthouse s'y branche (idée B)
        `--remote-debugging-port=${this.debugPort}`,
      ],
    });

    this.browser = await this.launching;
    this.launching = null;
    return this.browser;
  }

  getDebugPort(): number {
    return this.debugPort;
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

