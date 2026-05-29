/**
 * Vector Store Abstraction — types
 *
 * A backend-agnostic interface for the vector database operations ContextMCP
 * needs: ensure an index exists, upsert embedding records, clear vectors, and
 * read stats. Pinecone and Qdrant adapters implement this so the rest of the
 * codebase (reindex, clean-vectors) never imports a vendor SDK directly.
 */

import type { EmbeddingRecord } from '../embeddings/core.js';

export type { EmbeddingRecord };

export interface VectorStoreStats {
  /** Total number of vectors currently stored. */
  vectorCount: number;
  /** Dimensionality of the stored vectors (if known). */
  dimension?: number;
}

export interface EnsureIndexOptions {
  /** Embedding dimension the index must hold. */
  dimension: number;
  /** Distance metric; defaults to cosine. */
  metric?: 'cosine' | 'euclidean' | 'dotproduct';
}

/**
 * Backend-agnostic vector store. All methods are async and idempotent where
 * noted so callers (reindex/clean) can treat every backend the same way.
 */
export interface VectorStore {
  /** Human-readable backend name, e.g. "pinecone" or "qdrant". */
  readonly provider: string;

  /** Create the index/collection if it doesn't already exist (idempotent). */
  ensureIndex(options: EnsureIndexOptions): Promise<void>;

  /** Upsert a batch of embedding records. */
  upsert(records: EmbeddingRecord[]): Promise<void>;

  /**
   * Delete all vectors from the index/collection.
   * Returns how many existed before clearing when the backend can report it.
   */
  clear(): Promise<{ success: boolean; vectorCount?: number }>;

  /** Read current index/collection statistics. */
  stats(): Promise<VectorStoreStats>;
}
