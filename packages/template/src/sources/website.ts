/**
 * Website Source Fetcher
 *
 * Crawls a documentation website and downloads its pages as HTML for the
 * `html` parser to process. Page discovery prefers a sitemap.xml when
 * available, and otherwise falls back to a same-origin breadth-first crawl
 * bounded by maxPages and crawlDepth.
 */

import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import * as path from 'path';
import { parse as parseHtml } from 'node-html-parser';
import { SourceConfig } from '../config/schema.js';
import type { FetchedSource } from './github.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const TEMP_DIR = path.join(process.cwd(), '.temp-repos');
const DEFAULT_MAX_PAGES = 100;
const DEFAULT_CRAWL_DEPTH = 3;
const FETCH_TIMEOUT_MS = 30000;

// =============================================================================
// PURE HELPERS (unit-tested)
// =============================================================================

/**
 * Extract page URLs from a sitemap.xml document.
 * Handles both <urlset> (page sitemaps) and <sitemapindex> (nested sitemaps);
 * callers should recurse into returned sitemap URLs if needed.
 */
export function parseSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const locRegex = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = locRegex.exec(xml)) !== null) {
    urls.push(match[1].trim());
  }
  return urls;
}

/**
 * Whether a URL belongs to the same origin (protocol + host) as the base.
 */
export function isSameOrigin(url: string, baseOrigin: string): boolean {
  try {
    return new URL(url).origin === baseOrigin;
  } catch {
    return false;
  }
}

/**
 * Extract same-origin, http(s) page links from an HTML document, resolved
 * against the page URL and stripped of fragments. Returns a de-duplicated list.
 */
export function extractLinks(html: string, pageUrl: string): string[] {
  const root = parseHtml(html, { comment: false });
  const baseOrigin = new URL(pageUrl).origin;
  const found = new Set<string>();

  for (const anchor of root.querySelectorAll('a')) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;

    let resolved: URL;
    try {
      resolved = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
    if (resolved.origin !== baseOrigin) continue;

    resolved.hash = '';
    found.add(resolved.toString());
  }

  return [...found];
}

/**
 * Convert a page URL into a safe, unique relative .html filename that mirrors
 * the URL path (e.g. https://x.com/docs/intro -> docs/intro.html).
 */
export function urlToFilename(url: string): string {
  const parsed = new URL(url);
  let pathname = parsed.pathname;

  // Directory-style URL -> index page.
  if (pathname.endsWith('/') || pathname === '') {
    pathname = `${pathname}index`;
  }
  // Strip a leading slash and any existing extension we will replace.
  let rel = pathname.replace(/^\//, '').replace(/\.(html?|php|aspx?)$/i, '');
  if (rel === '') rel = 'index';

  // Encode a query string into the filename so distinct pages don't collide.
  if (parsed.search) {
    rel += '_' + parsed.search.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  }

  // Sanitize each path segment.
  const safe = rel
    .split('/')
    .map(seg => seg.replace(/[^a-z0-9._-]+/gi, '-'))
    .join('/');

  return `${safe}.html`;
}

/**
 * Whether a fetch to `url` is permitted given an optional origin restriction.
 * Pure and unit-tested; used to gate both the initial request URL and the
 * final URL after redirects. With no restriction, everything is allowed.
 */
export function isFetchAllowed(url: string, allowedOrigin?: string): boolean {
  if (!allowedOrigin) return true;
  return isSameOrigin(url, allowedOrigin);
}

// =============================================================================
// FETCHING
// =============================================================================

/**
 * Fetch text from a URL with a timeout. When `allowedOrigin` is provided, the
 * request is refused if the URL — or the final URL after any redirects — is not
 * same-origin. This prevents SSRF where a same-origin URL 302-redirects to an
 * internal host (e.g. http://169.254.169.254/ cloud metadata).
 */
async function fetchText(url: string, allowedOrigin?: string): Promise<string | null> {
  if (!isFetchAllowed(url, allowedOrigin)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    // Reject cross-origin redirect targets.
    if (res.url && !isFetchAllowed(res.url, allowedOrigin)) return null;
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    // Only collect HTML/XML pages.
    if (!contentType.includes('html') && !contentType.includes('xml') && contentType !== '') {
      return null;
    }
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Discover page URLs via sitemap.xml (one level of sitemap-index recursion),
 * returning null if no sitemap is found so the caller can fall back to crawling.
 *
 * All sitemap and child-sitemap fetches are constrained to `origin` so a
 * malicious or compromised sitemap can't point the fetcher at internal hosts.
 */
async function discoverViaSitemap(
  sitemapUrl: string,
  maxPages: number,
  origin: string
): Promise<string[] | null> {
  const xml = await fetchText(sitemapUrl, origin);
  if (!xml || !xml.includes('<loc>')) return null;

  const entries = parseSitemapUrls(xml);
  const pageUrls: string[] = [];

  // A sitemap index points at child sitemaps (also .xml). Recurse one level,
  // but only into same-origin child sitemaps.
  const childSitemaps = entries.filter(u => u.toLowerCase().endsWith('.xml'));
  if (childSitemaps.length > 0 && childSitemaps.length === entries.length) {
    for (const child of childSitemaps) {
      if (pageUrls.length >= maxPages) break;
      const childXml = await fetchText(child, origin);
      if (childXml) pageUrls.push(...parseSitemapUrls(childXml));
    }
  } else {
    pageUrls.push(...entries);
  }

  return pageUrls.slice(0, maxPages);
}

/**
 * Breadth-first same-origin crawl from a base URL, bounded by depth and count.
 */
async function discoverViaCrawl(
  baseUrl: string,
  maxPages: number,
  maxDepth: number
): Promise<{ url: string; html: string }[]> {
  const results: { url: string; html: string }[] = [];
  const visited = new Set<string>();
  const origin = new URL(baseUrl).origin;
  let frontier: string[] = [new URL(baseUrl).toString()];

  for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const url of frontier) {
      if (results.length >= maxPages) break;
      if (visited.has(url)) continue;
      visited.add(url);

      // Same-origin bound (also guards against cross-origin redirects).
      const html = await fetchText(url, origin);
      if (!html) continue;
      results.push({ url, html });

      if (depth < maxDepth) {
        for (const link of extractLinks(html, url)) {
          if (!visited.has(link)) next.push(link);
        }
      }
    }
    frontier = next;
  }

  return results;
}

// =============================================================================
// WEBSITE FETCHER
// =============================================================================

/**
 * Crawl a website and stage its pages as .html files for the html parser.
 *
 * Config fields used:
 * - url: base URL to crawl (required)
 * - sitemap: optional explicit sitemap URL (defaults to <origin>/sitemap.xml)
 * - maxPages: cap on pages to download (default 100)
 * - crawlDepth: max link-follow depth when crawling (default 3)
 */
export async function fetchWebsiteSource(source: SourceConfig): Promise<FetchedSource> {
  if (!source.url) {
    throw new Error(`Website source '${source.name}' requires 'url' field`);
  }

  const baseUrl = source.url;
  const origin = new URL(baseUrl).origin;
  const maxPages = source.maxPages ?? DEFAULT_MAX_PAGES;
  const crawlDepth = source.crawlDepth ?? DEFAULT_CRAWL_DEPTH;
  const localPath = path.join(TEMP_DIR, `website-${source.name}`);

  // Start clean to avoid mixing stale pages across runs.
  if (existsSync(localPath)) rmSync(localPath, { recursive: true });
  mkdirSync(localPath, { recursive: true });

  // 1. Try sitemap-based discovery first.
  const sitemapUrl = source.sitemap || `${origin}/sitemap.xml`;
  const sitemapUrls = await discoverViaSitemap(sitemapUrl, maxPages, origin);

  let pages: { url: string; html: string }[] = [];
  if (sitemapUrls && sitemapUrls.length > 0) {
    for (const url of sitemapUrls) {
      if (pages.length >= maxPages) break;
      if (!isSameOrigin(url, origin)) continue;
      const html = await fetchText(url, origin);
      if (html) pages.push({ url, html });
    }
  }

  // 2. Fall back to crawling if the sitemap yielded nothing.
  if (pages.length === 0) {
    pages = await discoverViaCrawl(baseUrl, maxPages, crawlDepth);
  }

  if (pages.length === 0) {
    throw new Error(`Website source '${source.name}': no pages found at ${baseUrl}`);
  }

  // Stage each page as an .html file mirroring its URL path.
  for (const { url, html } of pages) {
    const filename = urlToFilename(url);
    const filePath = path.join(localPath, filename);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, html);
  }

  console.log(`   🌐 Downloaded ${pages.length} page(s) from ${baseUrl}`);

  return {
    name: source.name,
    displayName: source.displayName || source.name,
    localPath,
    cleanup: () => {
      if (existsSync(localPath)) {
        rmSync(localPath, { recursive: true });
      }
    },
  };
}
