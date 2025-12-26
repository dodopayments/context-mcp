/**
 * Local Source Fetcher
 *
 * Uses local filesystem paths for documentation parsing.
 * Useful for development and private documentation.
 */

import { existsSync } from 'fs';
import * as path from 'path';
import { SourceConfig } from '../config/schema.js';
import { FetchedSource } from './github.js';

// =============================================================================
// LOCAL FETCHER
// =============================================================================

/**
 * Resolve a local filesystem path for parsing
 */
export async function fetchLocalSource(source: SourceConfig): Promise<FetchedSource | null> {
  if (!source.localPath) {
    throw new Error(`Local source '${source.name}' requires 'localPath' field`);
  }

  const localPath = path.resolve(source.localPath);

  if (!existsSync(localPath)) {
    if (source.optional) {
      return null;
    }
    throw new Error(`Local path not found: ${localPath}`);
  }

  return {
    name: source.name,
    displayName: source.displayName || source.name,
    localPath,
    // No cleanup needed for local sources
    cleanup: () => {},
  };
}
