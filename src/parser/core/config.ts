/**
 * Centralized Chunking Configuration
 * 
 * Single source of truth for all parser configurations.
 * Each source type can have its own config with sensible defaults.
 */

import { ChunkConfig } from '../../types/index.js';

// =============================================================================
// BASE CONFIGURATION
// =============================================================================

/**
 * Default chunking configuration optimized for semantic search
 * Research shows 128-512 tokens is optimal for RAG retrieval precision.
 * Character estimates: ~4 chars per token
 */
export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  maxChunkSize: 1800,     // ~450 tokens - upper limit for good precision
  minChunkSize: 150,      // ~40 tokens - avoid tiny fragments that lack context
  idealChunkSize: 800,    // ~200 tokens - sweet spot for retrieval precision
};

// =============================================================================
// SOURCE-SPECIFIC CONFIGURATIONS
// =============================================================================

/**
 * Configuration for SDK documentation (README, CHANGELOG, MIGRATION)
 * Slightly larger to preserve code block context
 */
export const SDK_CHUNK_CONFIG: ChunkConfig = {
  maxChunkSize: 2000,     // ~500 tokens - preserve code blocks
  minChunkSize: 150,      // Consistent minimum
  idealChunkSize: 1000,   // ~250 tokens - target for merging
};

/**
 * Configuration for BillingSDK Fumadocs documentation
 */
export const BILLINGSDK_CHUNK_CONFIG: ChunkConfig = {
  maxChunkSize: 2000,     // ~500 tokens
  minChunkSize: 120,      // Slightly lower to preserve component docs
  idealChunkSize: 1000,   // ~250 tokens
};

/**
 * Configuration for OpenAPI specification parsing
 * API docs with examples can be slightly larger but should still be focused
 */
export const OPENAPI_CHUNK_CONFIG: ChunkConfig = {
  maxChunkSize: 2500,     // ~625 tokens - allow for complex schemas
  minChunkSize: 200,      // API endpoints need more context
  idealChunkSize: 1200,   // ~300 tokens
};

/**
 * Configuration for Mintlify documentation
 */
export const DOCS_CHUNK_CONFIG: ChunkConfig = {
  ...DEFAULT_CHUNK_CONFIG,
};

// =============================================================================
// URL CONFIGURATIONS
// =============================================================================

export const DOCS_BASE_URL = 'https://docs.dodopayments.com';
export const BILLINGSDK_DOCS_URL = 'https://billingsdk.com/docs';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get configuration for a specific source type
 */
export function getChunkConfig(sourceType: 'docs' | 'sdk' | 'billingsdk' | 'openapi'): ChunkConfig {
  switch (sourceType) {
    case 'docs':
      return DOCS_CHUNK_CONFIG;
    case 'sdk':
      return SDK_CHUNK_CONFIG;
    case 'billingsdk':
      return BILLINGSDK_CHUNK_CONFIG;
    case 'openapi':
      return OPENAPI_CHUNK_CONFIG;
    default:
      return DEFAULT_CHUNK_CONFIG;
  }
}

// =============================================================================
// PATH CONFIGURATION
// =============================================================================

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TEMP_DIR = path.resolve(__dirname, '../../../.temp-repos');
export const DATA_DIR = path.resolve(__dirname, '../../../data');

// =============================================================================
// FILE UTILITIES
// =============================================================================

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function cloneRepo(url: string, targetDir: string): void {
  console.log(`Cloning ${url}...`);
  
  if (fs.existsSync(targetDir)) {
    try {
      execSync(`git -C "${targetDir}" pull`, { stdio: 'pipe' });
    } catch {
      console.log(`  Using existing version (pull failed)`);
    }
  } else {
    execSync(`git clone --depth 1 "${url}" "${targetDir}"`, { stdio: 'pipe' });
  }
}

export function extractRepoInfo(url: string): { owner: string; name: string; fullName: string } {
  const match = url.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
  if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
  return { owner: match[1], name: match[2], fullName: `${match[1]}/${match[2]}` };
}
