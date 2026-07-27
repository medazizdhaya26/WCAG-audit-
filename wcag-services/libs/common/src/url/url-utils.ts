const DEFAULT_IGNORED_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'mp3',
  'mp4',
  'avi',
  'mov',
  'wmv',
  'mkv',
  'css',
  'js',
  'map',
  'ico',
  'woff',
  'woff2',
  'ttf',
  'eot',
]);

export type NormalizeUrlOptions = {
  stripHash?: boolean;
  stripTrailingSlash?: boolean;
  stripUtmParams?: boolean;
};

export function isProbablyStaticAsset(url: URL): boolean {
  const pathname = url.pathname.toLowerCase();
  const lastDot = pathname.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = pathname.slice(lastDot + 1);
  return DEFAULT_IGNORED_EXTENSIONS.has(ext);
}

export function normalizeUrl(input: string, options: NormalizeUrlOptions = {}): string {
  const { stripHash = true, stripTrailingSlash = true, stripUtmParams = true } = options;
  const url = new URL(input);

  url.hash = stripHash ? '' : url.hash;
  url.username = '';
  url.password = '';

  url.hostname = url.hostname.toLowerCase();

  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
    url.port = '';
  }

  if (stripUtmParams) {
    const keysToDelete: string[] = [];
    url.searchParams.forEach((_v, k) => {
      const key = k.toLowerCase();
      if (key.startsWith('utm_') || key === 'gclid' || key === 'fbclid') {
        keysToDelete.push(k);
      }
    });
    for (const k of keysToDelete) url.searchParams.delete(k);
  }

  if (url.searchParams.toString() === '') {
    url.search = '';
  }

  if (stripTrailingSlash && url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

export function isInternalUrl(candidate: URL, root: URL): boolean {
  return candidate.hostname.toLowerCase() === root.hostname.toLowerCase();
}

export function safeResolveUrl(baseUrl: string, href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:') || trimmed.startsWith('javascript:')) return null;
  if (trimmed.startsWith('#')) return null;

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

