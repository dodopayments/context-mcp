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
// URL FETCHER
// =============================================================================

/**
 * Fetch content from a URL for parsing
 */
export async function fetchURLSource(source: SourceConfig): Promise<FetchedSource> {
  if (!source.url) {
    throw new Error(`URL source '${source.name}' requires 'url' field`);
  }

  const filename = resolveUrlFilename(source.url, source.saveAs);

  const localPath = path.join(TEMP_DIR, source.name);
  mkdirSync(localPath, { recursive: true });

  // Retries on transient network failures / 5xx / rate limits with a timeout.
  const response = await fetchWithRetry(source.url);

  const content = await response.text();

  const filePath = path.join(localPath, filename);

  writeFileSync(filePath, content);

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
