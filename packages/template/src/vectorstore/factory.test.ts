import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createVectorStore, PineconeStore, QdrantStore } from './index.js';
import type { ContextMCPConfig } from '../config/schema.js';

const baseConfig = {
  embeddings: { provider: 'openai', model: 'text-embedding-3-large', dimensions: 3072 },
  sources: [],
  reindex: { clearBeforeReindex: true, batchSize: 100 },
} as unknown as ContextMCPConfig;

const savedEnv = { ...process.env };

beforeEach(() => {
  delete process.env.PINECONE_API_KEY;
  delete process.env.QDRANT_URL;
  delete process.env.QDRANT_API_KEY;
});

afterEach(() => {
  process.env = { ...savedEnv };
});

describe('createVectorStore', () => {
  it('builds a PineconeStore for the pinecone provider', () => {
    process.env.PINECONE_API_KEY = 'pk';
    const store = createVectorStore({
      ...baseConfig,
      vectordb: { provider: 'pinecone', indexName: 'docs' },
    } as ContextMCPConfig);
    expect(store).toBeInstanceOf(PineconeStore);
    expect(store.provider).toBe('pinecone');
  });

  it('throws when PINECONE_API_KEY is missing', () => {
    expect(() =>
      createVectorStore({
        ...baseConfig,
        vectordb: { provider: 'pinecone', indexName: 'docs' },
      } as ContextMCPConfig)
    ).toThrow(/PINECONE_API_KEY/);
  });

  it('builds a QdrantStore for the qdrant provider', () => {
    const store = createVectorStore({
      ...baseConfig,
      vectordb: { provider: 'qdrant', indexName: 'docs', qdrant: { url: 'http://localhost:6333' } },
    } as ContextMCPConfig);
    expect(store).toBeInstanceOf(QdrantStore);
    expect(store.provider).toBe('qdrant');
  });
});
