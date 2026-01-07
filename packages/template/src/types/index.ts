/**
 * Core types for documentation parsing and chunking
 * 
 * These types are shared between all parsers:
 * - mdx-chunker.ts (MDX/JSX documentation)
 * - markdown-chunker.ts (plain markdown files)
 * - openapi-parser.ts (API specification)
 */

// =============================================================================
// FRONTMATTER & DOCUMENTS
// =============================================================================

/** Frontmatter extracted from MDX files */
export interface DocFrontmatter {
  title: string;
  description?: string;
}

// =============================================================================
// CHUNKS - The core unit for embedding and retrieval
// =============================================================================

/** 
 * A chunk of documentation content optimized for semantic search
 * 
 * Design principles:
 * - `content` is the primary field for embedding generation
 * - `heading` should be clean and semantic (no markdown, newlines)
 * - `metadata` provides context for filtering and display
 */
export interface DocChunk {
  // === Identity ===
  id: string;               // Unique chunk ID (e.g., "api-reference/payments#0")

  // === Source Document ===
  documentPath: string;     // Source file path
  documentTitle: string;    // Human-readable document title
  category: string;         // Category for filtering

  // === Content ===
  heading: string;          // Section heading - clean, no markdown/newlines
  content: string;          // The actual chunk content for embedding
  
  // === Metadata ===
  metadata: ChunkMetadata;
}

/** Metadata that enriches chunks for better retrieval and display */
export interface ChunkMetadata {
  // === Common ===
  description?: string;       // Short summary of the chunk
  sourceUrl?: string;         // Full URL to the source

  // === API Documentation (from OpenAPI) ===
  method?: string;            // HTTP method (GET, POST, etc.) - for API chunks
  path?: string;              // API path (e.g., /v1/payments)
  
  // === Code/SDK context ===
  language?: string;          // Programming language (typescript, python, etc.)
  repository?: string;        // GitHub repo (e.g., "dodopayments/dodopayments-typescript")
  
  // === Version (for changelogs) ===
  version?: string;           // Version number (for changelogs)
}

// =============================================================================
// CHUNKING CONFIGURATION
// =============================================================================

/** Configuration for the chunking process */
export interface ChunkConfig {
  maxChunkSize: number;       // Maximum characters per chunk
  minChunkSize: number;       // Minimum characters for standalone chunk
  idealChunkSize: number;     // Target size for merging small sections
}
