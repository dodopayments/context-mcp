import { describe, it, expect } from 'vitest';
import {
  parseSitemapUrls,
  isSameOrigin,
  extractLinks,
  urlToFilename,
  isFetchAllowed,
} from './website.js';

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
