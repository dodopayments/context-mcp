import { describe, it, expect } from 'vitest';
import { loadServerConfig } from './config.js';

const minimalEnv = {
  PINECONE_API_KEY: 'pk',
  PINECONE_INDEX_NAME: 'docs',
};

describe('loadServerConfig', () => {
  it('throws when required vars are missing', () => {
    expect(() => loadServerConfig({})).toThrow(/PINECONE_API_KEY/);
    expect(() => loadServerConfig({ PINECONE_API_KEY: 'pk' })).toThrow(/PINECONE_INDEX_NAME/);
  });

  it('applies sensible defaults', () => {
    const config = loadServerConfig(minimalEnv);
    expect(config.port).toBe(8787);
    expect(config.embeddingProvider).toBe('openai');
    expect(config.embeddingModel).toBe('text-embedding-3-large');
    expect(config.embeddingDimensions).toBe(3072);
    expect(config.defaultTopK).toBe(10);
    expect(config.maxTopK).toBe(20);
    expect(config.enableRerank).toBe(true);
    expect(config.ollamaBaseUrl).toBe('http://localhost:11434');
  });

  it('parses numeric vars and disables rerank when set to "false"', () => {
    const config = loadServerConfig({
      ...minimalEnv,
      PORT: '3000',
      DEFAULT_TOP_K: '5',
      MAX_TOP_K: '15',
      ENABLE_RERANK: 'false',
      EMBEDDING_DIMENSIONS: '1536',
    });
    expect(config.port).toBe(3000);
    expect(config.defaultTopK).toBe(5);
    expect(config.maxTopK).toBe(15);
    expect(config.enableRerank).toBe(false);
    expect(config.embeddingDimensions).toBe(1536);
  });

  it('falls back to defaults for non-numeric values', () => {
    const config = loadServerConfig({ ...minimalEnv, PORT: 'not-a-number' });
    expect(config.port).toBe(8787);
  });

  it('throws on an out-of-range PORT instead of crashing in listen()', () => {
    expect(() => loadServerConfig({ ...minimalEnv, PORT: '99999' })).toThrow(/Invalid PORT/);
    expect(() => loadServerConfig({ ...minimalEnv, PORT: '-1' })).toThrow(/Invalid PORT/);
    expect(() => loadServerConfig({ ...minimalEnv, PORT: '70000' })).toThrow(/Invalid PORT/);
  });

  it('still allows port 0 (OS-assigned ephemeral)', () => {
    expect(loadServerConfig({ ...minimalEnv, PORT: '0' }).port).toBe(0);
  });
});
