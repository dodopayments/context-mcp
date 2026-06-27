/**
 * URL Source Fetcher
 *
 * Fetches content from URLs for documentation parsing.
 * Useful for OpenAPI specs and remote documentation.
 */

import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import * as path from 'path';
import { SourceConfig } from '../config/schema.js';
import { FetchedSource } from './github.js';
import { fetchWithRetry } from './http.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const TEMP_DIR = path.join(process.cwd(), '.temp-repos');

// =============================================================================
// FILENAME RESOLUTION
// =============================================================================

/**
 * Resolve the on-disk filename for fetched URL content. `saveAs` overrides the
 * URL-derived basename (parsers select files by extension, so this lets a
 * Markdown doc served at `.txt` be saved as `.md`). Rejects path separators so
 * a config value can't escape the source's temp directory.
 */
export function resolveUrlFilename(url: string, saveAs?: string): string {
  if (saveAs !== undefined) {
    if (saveAs.trim() === '') {
      throw new Error(`Invalid 'saveAs' value: must not be empty`);
    }
    if (saveAs.includes('/') || saveAs.includes('\\') || saveAs === '.' || saveAs === '..') {
      throw new Error(
        `Invalid 'saveAs' value '${saveAs}': must be a bare filename without path separators`
      );
    }
    return saveAs;
  }

  const urlPath = new URL(url).pathname;
  return path.basename(urlPath) || 'content.yaml';
}

// =============================================================================
// LINK INDEX EXTRACTION
// =============================================================================

/**
 * Extract the distinct absolute URLs referenced by a link-index document (e.g.
 * an llms.txt). Optionally restricts to an allowlist of hosts, and normalizes
 * each URL by dropping the query/fragment and trailing slash. The document's
 * own host root is skipped.
 */
export function extractSeedLinks(content: string, hostAllowlist: string[] = []): string[] {
  const matches = content.match(/https?:\/\/[^\s)\]"'>,]+/g) ?? [];
  const out = new Set<string>();

  for (const candidate of matches) {
    let url: URL;
    try {
      url = new URL(candidate.replace(/[.,;]+$/, ''));
    } catch {
      continue;
    }
    if (hostAllowlist.length > 0 && !hostAllowlist.includes(url.hostname)) continue;

    url.hash = '';
    url.search = '';
    const pathname = url.pathname.replace(/\/+$/, '');
    if (pathname === '') continue;

    out.add(`${url.protocol}//${url.hostname}${pathname}`);
  }

  return [...out].sort();
}

/**
 * Save a linked page under a path mirroring its URL pathname so the parser can
 * later reconstruct the canonical page URL. Returns false if the resolved path
 * would escape the source directory.
 */
function saveLinkedPage(localPath: string, pageUrl: string, ext: string, body: string): boolean {
  const relative = new URL(pageUrl).pathname.replace(/^\/+/, '') + ext;
  const dest = path.resolve(localPath, relative);
  const base = path.resolve(localPath);
  if (dest !== base && !dest.startsWith(base + path.sep)) {
    return false;
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, body);
  return true;
}

async function fetchLinkedPages(
  source: SourceConfig,
  seedContent: string,
  localPath: string
): Promise<number> {
  const { hostAllowlist = [], appendExtension = '', maxPages = 500 } = source.followLinks ?? {};
  const links = extractSeedLinks(seedContent, hostAllowlist).slice(0, maxPages);

  let saved = 0;
  for (const pageUrl of links) {
    const fetchUrl = `${pageUrl}${appendExtension}`;
    try {
      const response = await fetchWithRetry(fetchUrl);
      const body = await response.text();
      if (saveLinkedPage(localPath, pageUrl, appendExtension, body)) saved++;
    } catch (err) {
      console.warn(`   ⚠️  Skipped ${fetchUrl}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return saved;
}

// =============================================================================
// URL FETCHER
// =============================================================================

/**
 * Fetch content from a URL for parsing
 */
export async function fetchURLSource(source: SourceConfig): Promise<FetchedSource> {
  if (!source.url) {
    throw new Error(`URL source '${source.name}' requires 'url' field`);
  }

  const localPath = path.join(TEMP_DIR, source.name);
  mkdirSync(localPath, { recursive: true });

  // Retries on transient network failures / 5xx / rate limits with a timeout.
  const response = await fetchWithRetry(source.url);
  const content = await response.text();

  if (source.followLinks) {
    const saved = await fetchLinkedPages(source, content, localPath);
    console.log(`   🔗 Indexed ${saved} linked page(s) from ${source.url}`);
  } else {
    const filename = resolveUrlFilename(source.url, source.saveAs);
    writeFileSync(path.join(localPath, filename), content);
  }

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
