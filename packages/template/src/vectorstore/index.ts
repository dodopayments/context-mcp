/**
 * Vector Store factory
 *
 * Builds a VectorStore from the validated config + environment, hiding the
 * choice of backend (Pinecone, Qdrant) from the rest of the codebase.
 */

import type { ContextMCPConfig } from '../config/schema.js';
import type { VectorStore } from './types.js';
import { PineconeStore } from './pinecone-store.js';
import { QdrantStore } from './qdrant-store.js';

export type { VectorStore, VectorStoreStats, EnsureIndexOptions } from './types.js';
export { PineconeStore } from './pinecone-store.js';
export { QdrantStore } from './qdrant-store.js';

/**
 * Create a vector store for the configured provider.
 *
 * Reads provider-specific secrets from the environment:
 * - pinecone: PINECONE_API_KEY
 * - qdrant:   QDRANT_URL (default http://localhost:6333), QDRANT_API_KEY (optional)
 */
export function createVectorStore(config: ContextMCPConfig): VectorStore {
  const { vectordb } = config;

  switch (vectordb.provider) {
    case 'pinecone':
      return new PineconeStore({
        apiKey: requireEnv('PINECONE_API_KEY'),
        indexName: vectordb.indexName,
        cloud: vectordb.pinecone?.cloud,
        region: vectordb.pinecone?.region,
        namespace: vectordb.namespace,
      });

    case 'qdrant':
      return new QdrantStore({
        url: process.env.QDRANT_URL || vectordb.qdrant?.url || 'http://localhost:6333',
        collection: vectordb.indexName,
        apiKey: process.env.QDRANT_API_KEY,
      });

    default:
      throw new Error(`Unknown vectordb.provider: ${(vectordb as { provider: string }).provider}`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
