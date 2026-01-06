/**
 * Source Fetcher Router
 *
 * Unified interface for fetching documentation from various sources.
 * Routes to appropriate fetcher based on source type.
 */

import { SourceConfig } from '../config/schema.js';
import { fetchGitHubSource, type FetchedSource } from './github.js';
import { fetchLocalSource } from './local.js';
import { fetchURLSource } from './url.js';

// Re-export types
export type { FetchedSource };

// =============================================================================
// ROUTER
// =============================================================================

/**
 * Fetch a documentation source based on its type
 *
 * @param source - Source configuration from config.yaml
 * @returns Fetched source with local path, or null if optional source not found
 */
export async function fetchSource(source: SourceConfig): Promise<FetchedSource | null> {
  switch (source.type) {
    case 'github':
      return fetchGitHubSource(source);

    case 'local':
      return fetchLocalSource(source);

    case 'url':
      return fetchURLSource(source);

    default:
      throw new Error(`Unknown source type: ${(source as SourceConfig).type}`);
  }
}

/**
 * Cleanup all fetched sources
 */
export function cleanupSources(sources: FetchedSource[]): void {
  for (const source of sources) {
    try {
      source.cleanup();
    } catch (error) {
      console.warn(`   ⚠️  Failed to cleanup ${source.name}: ${error}`);
    }
  }
}
