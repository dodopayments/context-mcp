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

// =============================================================================
// CONSTANTS
// =============================================================================

const TEMP_DIR = path.join(process.cwd(), '.temp-repos');

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

  const response = await fetch(source.url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${source.url}: ${response.status} ${response.statusText}`);
  }

  const content = await response.text();

  // Determine filename from URL
  const urlPath = new URL(source.url).pathname;
  const filename = path.basename(urlPath) || 'content.yaml';
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
