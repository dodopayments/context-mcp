/**
 * OpenAPI Parser Router
 *
 * Wrapper for the existing OpenAPI parser that integrates with
 * the new config-driven architecture.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DocChunk, ChunkConfig } from '../../types/index.js';
import { SourceConfig } from '../../config/schema.js';
import { parseOpenApiSpec } from './openapi-parser.js';
import { DEFAULT_CHUNK_CONFIG } from '../core/config.js';

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Parse OpenAPI documentation from a source
 */
export function parseOpenAPISource(
  source: SourceConfig,
  localPath: string,
  chunkConfig: ChunkConfig = DEFAULT_CHUNK_CONFIG
): DocChunk[] {
  // Find OpenAPI spec file
  const files = fs.readdirSync(localPath);
  const specFile = files.find(f => /\.(ya?ml|json)$/i.test(f));

  if (!specFile) {
    console.log(`   ⚠️  No OpenAPI spec file found in ${localPath}`);
    return [];
  }

  const specPath = path.join(localPath, specFile);

  // Determine docsRoot and urlMappingDir for URL mapping
  let docsRoot: string | undefined;
  let urlMappingDir: string | undefined;
  
  if (source.urlMappingDir) {
    // localPath is {repoRoot}/{source.path}, so docsRoot is {repoRoot}
    if (source.path && source.path !== '.') {
      docsRoot = path.dirname(localPath);
    } else {
      docsRoot = localPath;
    }
    urlMappingDir = source.urlMappingDir;
  }

  // baseUrl is required for OpenAPI sources
  if (!source.baseUrl) {
    throw new Error(`baseUrl is required for OpenAPI sources. Add baseUrl to source '${source.name}' in your configuration.`);
  }

  // Use existing parser with URL mapping configuration
  const chunks = parseOpenApiSpec(specPath, source.baseUrl, docsRoot, urlMappingDir, chunkConfig);

  return chunks;
}

