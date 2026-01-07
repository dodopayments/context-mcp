/**
 * Parser Router
 *
 * Routes documentation sources to the appropriate parser/chunker.
 * Supports MDX, Markdown, and OpenAPI parsing.
 */

import { SourceConfig } from '../config/schema.js';
import type { FetchedSource } from '../sources/index.js';
import type { DocChunk, ChunkConfig } from '../types/index.js';

// Import parsers
import { parseMDXSource } from './chunkers/mdx-chunker.js';
import { parseMarkdownSource } from './chunkers/markdown-chunker.js';
import { parseOpenAPISource } from './chunkers/openapi-router.js';

// Re-export types
export type { DocChunk };

// =============================================================================
// PARSER ROUTER
// =============================================================================

/**
 * Parse a fetched source into documentation chunks
 *
 * @param source - Source configuration
 * @param fetched - Fetched source with local path
 * @param chunkConfig - Optional chunking configuration (uses defaults if not provided)
 * @returns Array of documentation chunks
 */
export async function parseSource(
  source: SourceConfig,
  fetched: FetchedSource,
  chunkConfig?: ChunkConfig
): Promise<DocChunk[]> {
  switch (source.parser) {
    case 'mdx':
      // MDX/JSX documentation (Mintlify, Fumadocs, Docusaurus, etc.)
      return parseMDXSource(source, fetched.localPath, chunkConfig);

    case 'markdown':
      // Plain markdown files (README, CHANGELOG, docs without JSX)
      return parseMarkdownSource(source, fetched.localPath, chunkConfig);

    case 'openapi':
      // OpenAPI/Swagger specifications
      return parseOpenAPISource(source, fetched.localPath, chunkConfig);

    default:
      throw new Error(`Unknown parser type: ${source.parser}`);
  }
}
