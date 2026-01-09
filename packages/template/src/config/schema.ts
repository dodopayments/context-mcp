/**
 * ContextMCP Configuration Schema
 *
 * Zod schemas for validating config.yaml configuration.
 * This is the single source of truth for configuration structure.
 */

import { z } from 'zod';

// =============================================================================
// SOURCE SCHEMA
// =============================================================================

export const SourceSchema = z
  .object({
    // Identity
    name: z.string().regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with hyphens'),
    displayName: z.string().optional(),

    // Source type
    type: z.enum(['github', 'local', 'url']),

    // GitHub sources
    repository: z.string().optional(),
    branch: z.string().default('main'),
    path: z.string().default('.'),

    // URL sources
    url: z.string().url().optional(),

    // Local sources
    localPath: z.string().optional(),

    // Parser type
    parser: z.enum(['mdx', 'markdown', 'openapi']),

    // Metadata enrichment
    language: z.string().optional(),
    baseUrl: z.string().url().optional(),

    // Behavior
    optional: z.boolean().default(false),

    // Skip directories by name (e.g., node_modules, .git, test, internal)
    skipDirs: z.array(z.string()).default([]),

    // Skip specific files by name (case-insensitive matching)
    skipFiles: z.array(z.string()).default([]),

    // For OpenAPI sources: directory with MDX files containing openapi: frontmatter
    // Used to build URL mapping from file paths (e.g., "api-reference")
    // If not set, URLs are generated from operationId pattern
    urlMappingDir: z.string().optional(),
  })
  .refine(
    data => {
      if (data.type === 'github' && !data.repository) {
        return false;
      }
      if (data.type === 'url' && !data.url) {
        return false;
      }
      if (data.type === 'local' && !data.localPath) {
        return false;
      }
      return true;
    },
    {
      message: 'Source must have repository (for github), url (for url), or localPath (for local)',
    }
  );

// =============================================================================
// MAIN CONFIG SCHEMA
// =============================================================================

// Vector database settings
const VectorDbSchema = z.object({
  provider: z.enum(['pinecone']).default('pinecone'),
  indexName: z.string(),
  namespace: z.string().optional(),
  pinecone: z
    .object({
      cloud: z.enum(['aws', 'gcp', 'azure']).default('aws'),
      region: z.string().default('us-east-1'),
    })
    .optional(),
});

// Embedding settings
const EmbeddingsSchema = z.object({
  provider: z.enum(['openai']).default('openai'),
  model: z.string().default('text-embedding-3-large'),
  dimensions: z.number().default(3072),
});

// Reindex settings
const ReindexSchema = z.object({
  clearBeforeReindex: z.boolean().default(true),
  batchSize: z.number().min(1).max(500).default(100),
});

// Chunking settings
const ChunkingSchema = z
  .object({
    maxChunkSize: z.number().min(100).max(10000).default(2000),
    minChunkSize: z.number().min(50).max(5000).default(250),
    idealChunkSize: z.number().min(100).max(5000).default(1000),
  })
  .optional();

export const ConfigSchema = z.object({
  vectordb: VectorDbSchema,
  embeddings: EmbeddingsSchema.optional().transform(
    v => v ?? { provider: 'openai' as const, model: 'text-embedding-3-large', dimensions: 3072 }
  ),
  sources: z.array(SourceSchema).min(1, 'At least one source is required'),
  reindex: ReindexSchema.optional().transform(
    v => v ?? { clearBeforeReindex: true, batchSize: 100 }
  ),
  chunking: ChunkingSchema,
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type SourceConfig = z.infer<typeof SourceSchema>;
export type ContextMCPConfig = z.infer<typeof ConfigSchema>;
