import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseSitemapUrls,
  isSameOrigin,
  extractLinks,
  urlToFilename,
  disambiguateFilename,
  isFetchAllowed,
  URL_MAP_FILENAME,
  fetchWebsiteSource,
} from './website.js';
import type { SourceConfig } from '../config/schema.js';

describe('parseSitemapUrls', () => {
  it('extracts <loc> URLs from a urlset sitemap', () => {
    const xml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://example.com/docs/intro</loc></url>
      </urlset>`;
    expect(parseSitemapUrls(xml)).toEqual([
      'https://example.com/',
      'https://example.com/docs/intro',
    ]);
  });

  it('trims whitespace inside loc tags', () => {
    expect(parseSitemapUrls('<loc>  https://x.com/a  </loc>')).toEqual(['https://x.com/a']);
  });

  it('returns an empty array when there are no loc tags', () => {
    expect(parseSitemapUrls('<urlset></urlset>')).toEqual([]);
  });
});

describe('isSameOrigin', () => {
  it('matches same protocol + host', () => {
    expect(isSameOrigin('https://x.com/a', 'https://x.com')).toBe(true);
  });

  it('rejects a different host', () => {
    expect(isSameOrigin('https://other.com/a', 'https://x.com')).toBe(false);
  });

  it('rejects a different protocol', () => {
    expect(isSameOrigin('http://x.com/a', 'https://x.com')).toBe(false);
  });

  it('returns false for an unparseable URL', () => {
    expect(isSameOrigin('not a url', 'https://x.com')).toBe(false);
  });
});

describe('extractLinks', () => {
  const html = `
    <a href="/docs/a">A</a>
    <a href="https://example.com/docs/b">B</a>
    <a href="https://other.com/x">external</a>
    <a href="#section">anchor</a>
    <a href="mailto:hi@example.com">mail</a>
    <a href="/docs/a#frag">dup of A with fragment</a>`;

  it('resolves relative links against the page URL', () => {
    const links = extractLinks(html, 'https://example.com/docs/');
    expect(links).toContain('https://example.com/docs/a');
    expect(links).toContain('https://example.com/docs/b');
  });

  it('excludes external, anchor, and mailto links', () => {
    const links = extractLinks(html, 'https://example.com/docs/');
    expect(links).not.toContain('https://other.com/x');
    expect(links.some(l => l.includes('mailto'))).toBe(false);
    expect(links.some(l => l.includes('#'))).toBe(false);
  });

  it('de-duplicates links that differ only by fragment', () => {
    const links = extractLinks(html, 'https://example.com/docs/');
    expect(links.filter(l => l === 'https://example.com/docs/a')).toHaveLength(1);
  });
});

describe('urlToFilename', () => {
  it('maps a directory-style URL to an index.html', () => {
    expect(urlToFilename('https://x.com/')).toBe('index.html');
    expect(urlToFilename('https://x.com/docs/')).toBe('docs/index.html');
  });

  it('mirrors a path and appends .html', () => {
    expect(urlToFilename('https://x.com/docs/intro')).toBe('docs/intro.html');
  });

  it('replaces an existing html/php extension', () => {
    expect(urlToFilename('https://x.com/page.html')).toBe('page.html');
    expect(urlToFilename('https://x.com/page.php')).toBe('page.html');
  });

  it('encodes a query string into the filename to avoid collisions', () => {
    const a = urlToFilename('https://x.com/p?id=1');
    const b = urlToFilename('https://x.com/p?id=2');
    expect(a).not.toBe(b);
    expect(a.endsWith('.html')).toBe(true);
  });
});

describe('disambiguateFilename (collision-safe staging)', () => {
  it('lets the first URL keep the plain filename', () => {
    const claimed = new Map<string, string>();
    expect(disambiguateFilename('a.html', 'https://x.com/a', claimed)).toBe('a.html');
  });

  it('is idempotent for the same URL claiming the same name', () => {
    const claimed = new Map<string, string>();
    const first = disambiguateFilename('a.html', 'https://x.com/a', claimed);
    const second = disambiguateFilename('a.html', 'https://x.com/a', claimed);
    expect(second).toBe(first);
  });

  it('disambiguates two DISTINCT URLs that map to the same filename', () => {
    // urlToFilename is lossy: /a and /a.html both -> a.html (extension strip),
    // and /docs/ and /docs/index both -> docs/index.html (dir-index collapse).
    const claimed = new Map<string, string>();
    const f1 = disambiguateFilename(urlToFilename('https://x.com/a'), 'https://x.com/a', claimed);
    const f2 = disambiguateFilename(
      urlToFilename('https://x.com/a.html'),
      'https://x.com/a.html',
      claimed
    );
    expect(f1).not.toBe(f2);
    expect(f1.endsWith('.html')).toBe(true);
    expect(f2.endsWith('.html')).toBe(true);
  });

  it('keeps directory-index vs explicit-index pages distinct', () => {
    const claimed = new Map<string, string>();
    const dir = disambiguateFilename(
      urlToFilename('https://x.com/docs/'),
      'https://x.com/docs/',
      claimed
    );
    const idx = disambiguateFilename(
      urlToFilename('https://x.com/docs/index'),
      'https://x.com/docs/index',
      claimed
    );
    expect(dir).not.toBe(idx);
  });

  it('does not collide a disambiguated name with an unrelated URL', () => {
    const claimed = new Map<string, string>();
    const names = new Set<string>();
    for (const u of ['https://x.com/p.php', 'https://x.com/p.aspx', 'https://x.com/p.html']) {
      names.add(disambiguateFilename(urlToFilename(u), u, claimed));
    }
    // Three distinct URLs that all map to p.html must stage to three files.
    expect(names.size).toBe(3);
  });
});

describe('isFetchAllowed (SSRF guard)', () => {
  const origin = 'https://docs.example.com';

  it('allows same-origin URLs', () => {
    expect(isFetchAllowed('https://docs.example.com/page', origin)).toBe(true);
    expect(isFetchAllowed('https://docs.example.com/sitemap.xml', origin)).toBe(true);
  });

  it('blocks cloud metadata and internal hosts', () => {
    expect(isFetchAllowed('http://169.254.169.254/latest/meta-data/', origin)).toBe(false);
    expect(isFetchAllowed('http://localhost:8080/admin', origin)).toBe(false);
    expect(isFetchAllowed('http://10.0.0.5/internal', origin)).toBe(false);
  });

  it('blocks a different external origin (e.g. a malicious sitemap <loc>)', () => {
    expect(isFetchAllowed('https://evil.com/sitemap.xml', origin)).toBe(false);
  });

  it('blocks a same-host but different-scheme/port origin', () => {
    expect(isFetchAllowed('http://docs.example.com/page', origin)).toBe(false);
    expect(isFetchAllowed('https://docs.example.com:8443/page', origin)).toBe(false);
  });

  it('blocks unparseable URLs', () => {
    expect(isFetchAllowed('not a url', origin)).toBe(false);
  });

  it('allows anything when no origin restriction is given', () => {
    expect(isFetchAllowed('http://169.254.169.254/', undefined)).toBe(true);
  });
});

describe('fetchWebsiteSource URL map sidecar', () => {
  const realFetch = globalThis.fetch;
  let staged: string | undefined;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    if (staged && fs.existsSync(staged)) fs.rmSync(staged, { recursive: true, force: true });
    staged = undefined;
  });

  function htmlResponse(body: string): Response {
    return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
  }
  function xmlResponse(body: string): Response {
    return new Response(body, { status: 200, headers: { 'content-type': 'application/xml' } });
  }

  it('writes a sidecar mapping staged files to their exact source URLs', async () => {
    const origin = 'https://docs.example.com';
    const page = (h: string) =>
      `<html><head><title>${h}</title></head><body><main><h2>${h}</h2>` +
      `<p>This is a sufficiently long paragraph of documentation text for ${h} so ` +
      `that the chunker and staging pipeline have real content to work with.</p>` +
      `</main></body></html>`;

    const sitemap = `<?xml version="1.0"?><urlset>
      <url><loc>${origin}/docs/intro?v=2</loc></url>
      <url><loc>${origin}/guide/</loc></url>
    </urlset>`;

    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/sitemap.xml')) return xmlResponse(sitemap);
      if (url.includes('/docs/intro')) return htmlResponse(page('Intro'));
      if (url.includes('/guide')) return htmlResponse(page('Guide'));
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const source = {
      name: 'site',
      type: 'website',
      parser: 'html',
      url: `${origin}/`,
      maxPages: 10,
      crawlDepth: 1,
    } as SourceConfig;

    const result = await fetchWebsiteSource(source);
    staged = result.localPath;

    const mapPath = path.join(result.localPath, URL_MAP_FILENAME);
    expect(fs.existsSync(mapPath)).toBe(true);

    const map = JSON.parse(fs.readFileSync(mapPath, 'utf-8')) as Record<string, string>;
    // The exact URLs (with query string) are preserved in the map values.
    const urls = Object.values(map);
    expect(urls).toContain(`${origin}/docs/intro?v=2`);
    expect(urls).toContain(`${origin}/guide/`);

    // Keys are the staged relative .html files; each maps back to a real URL.
    for (const [file, url] of Object.entries(map)) {
      expect(file.endsWith('.html')).toBe(true);
      expect(url.startsWith(origin)).toBe(true);
    }

    result.cleanup();
  });

  it('stages every page when distinct sitemap URLs map to the same filename', async () => {
    // Regression: /docs/ and /docs/index are DISTINCT pages but urlToFilename
    // maps both to docs/index.html. Before the collision-safe staging fix the
    // second silently overwrote the first on disk and in .url-map.json, so the
    // crawler reported 2 pages downloaded but only 1 survived.
    const origin = 'https://docs.example.com';
    const page = (h: string) =>
      `<html><head><title>${h}</title></head><body><main><h2>${h}</h2>` +
      `<p>This is a sufficiently long paragraph of documentation text for ${h} so ` +
      `that the chunker and staging pipeline have real content to work with.</p>` +
      `</main></body></html>`;

    const sitemap = `<?xml version="1.0"?><urlset>
      <url><loc>${origin}/docs/</loc></url>
      <url><loc>${origin}/docs/index</loc></url>
    </urlset>`;

    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/sitemap.xml')) return xmlResponse(sitemap);
      if (url.endsWith('/docs/')) return htmlResponse(page('Dir'));
      if (url.endsWith('/docs/index')) return htmlResponse(page('Explicit'));
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const source = {
      name: 'collide',
      type: 'website',
      parser: 'html',
      url: `${origin}/`,
      maxPages: 10,
      crawlDepth: 0,
    } as SourceConfig;

    const result = await fetchWebsiteSource(source);
    staged = result.localPath;

    const map = JSON.parse(
      fs.readFileSync(path.join(result.localPath, URL_MAP_FILENAME), 'utf-8')
    ) as Record<string, string>;

    // Both distinct pages must survive: 2 map entries, 2 distinct staged files,
    // and both real URLs preserved.
    const urls = Object.values(map);
    expect(urls).toContain(`${origin}/docs/`);
    expect(urls).toContain(`${origin}/docs/index`);
    expect(Object.keys(map)).toHaveLength(2);
    expect(new Set(Object.keys(map)).size).toBe(2);

    // And the files actually exist on disk (no overwrite).
    for (const file of Object.keys(map)) {
      expect(fs.existsSync(path.join(result.localPath, file))).toBe(true);
    }

    result.cleanup();
  });
});
