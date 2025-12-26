/**
 * Centralized Chunking Configuration
 * 
 * Default chunking configuration optimized for semantic search.
 * Research shows 128-512 tokens is optimal for RAG retrieval precision.
 * Character estimates: ~4 chars per token
 */

import { ChunkConfig } from '../../types/index.js';
import type { ContextMCPConfig } from '../../config/schema.js';

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  maxChunkSize: 2000,
  minChunkSize: 250,
  idealChunkSize: 1000,
};

/**
 * Get chunking configuration from config or use defaults
 */
export function getChunkConfigFromConfig(config?: ContextMCPConfig): ChunkConfig {
  if (config?.chunking) {
    return {
      maxChunkSize: config.chunking.maxChunkSize,
      minChunkSize: config.chunking.minChunkSize,
      idealChunkSize: config.chunking.idealChunkSize,
    };
  }
  return DEFAULT_CHUNK_CONFIG;
}

