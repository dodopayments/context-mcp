/**
 * Core types for documentation parsing and chunking
 * 
 * These types are shared between:
 * - docs-chunker.ts (MDX documentation files)
 * - sdk-chunker.ts (GitHub SDK repositories)
 * - openapi-parser.ts (API specification)
 * - billingsdk-chunker.ts (BillingSDK Fumadocs)
 */

// =============================================================================
// FRONTMATTER & DOCUMENTS
// =============================================================================

/** Frontmatter extracted from MDX files */
export interface DocFrontmatter {
  title: string;
  description?: string;
  sidebarTitle?: string;
  icon?: string;
  tag?: string;
}

/** A parsed document before chunking */
export interface ParsedDocument {
  path: string;           // Relative path from docs root
  slug: string;           // URL-friendly slug
  frontmatter: DocFrontmatter;
  content: string;        // Raw content without frontmatter
  category: string;       // Top-level category (api-reference, features, etc.)
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
  headingLevel: number;     // H1=1, H2=2, etc. (0 for intro sections)
  content: string;          // The actual chunk content for embedding
  
  // === Metadata ===
  metadata: ChunkMetadata;
}

/** Metadata that enriches chunks for better retrieval and display */
export interface ChunkMetadata {
  // === Common ===
  description?: string;       // Short summary of the chunk
  tags?: string[];            // Searchable tags (optional)
  sourceUrl?: string;         // Full URL to the source

  // === API Documentation (from OpenAPI) ===
  method?: string;            // HTTP method (GET, POST, etc.) - for API chunks
  path?: string;              // API path (e.g., /v1/payments)
  operationId?: string;       // OpenAPI operation ID
  
  // === Code samples ===
  language?: string;          // Programming language (typescript, python, etc.)
  codeLanguage?: string;      // Language of code block if chunk is primarily code

  // === SDK Documentation ===
  repository?: string;        // GitHub repo (e.g., "dodopayments/dodopayments-typescript")
  
  // === Context ===
  breadcrumbs?: string[];     // Parent headings for hierarchical context
  version?: string;           // Version number (for changelogs)
}

// =============================================================================
// INDEX - Collection of all chunks
// =============================================================================

/** Complete documentation index */
export interface DocsIndex {
  documents: ParsedDocument[];
  chunks: DocChunk[];
  categories: string[];
  generatedAt: string;
}

/** SDK documentation index with repository metadata */
export interface SDKIndex {
  generatedAt: string;
  totalChunks: number;
  repositories: RepositoryInfo[];
  chunks: DocChunk[];
}

export interface RepositoryInfo {
  repo: string;
  language: string;
  files: number;
  chunks: number;
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
