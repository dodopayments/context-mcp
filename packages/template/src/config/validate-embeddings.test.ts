import { describe, it, expect } from 'vitest';
import {
  validateEmbeddingConfig,
  validateDimensionMatch,
  EMBEDDING_PROVIDERS,
} from './validate-embeddings.js';
import { ConfigSchema, EMBEDDING_PROVIDER_IDS } from './schema.js';

describe('schema/provider registry are in sync', () => {
  it('the Zod enum accepts every provider in the registry', () => {
    for (const provider of EMBEDDING_PROVIDER_IDS) {
      const parsed = ConfigSchema.safeParse({
        vectordb: { provider: 'pinecone', indexName: 'docs' },
        embeddings: { provider, model: 'm', dimensions: 1024 },
        sources: [{ name: 'docs', type: 'local', parser: 'markdown', localPath: '.' }],
      });
      expect(parsed.success, `schema should accept provider "${provider}"`).toBe(true);
    }
  });

  it('every registry key is a schema-valid provider id (no drift)', () => {
    expect([...EMBEDDING_PROVIDER_IDS].sort()).toEqual(Object.keys(EMBEDDING_PROVIDERS).sort());
  });
});

describe('validateEmbeddingConfig', () => {
  it('accepts a valid OpenAI config', () => {
    const result = validateEmbeddingConfig({
      provider: 'openai',
      model: 'text-embedding-3-large',
      dimensions: 3072,
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('accepts a valid Gemini config', () => {
    const result = validateEmbeddingConfig({
      provider: 'gemini',
      model: 'gemini-embedding-2-preview',
      dimensions: 1536,
    });
    expect(result.errors).toEqual([]);
  });

  it('accepts a reduced (non-default) dimension within a range model', () => {
    // Regression: OpenAI text-embedding-3-* accept any `dimensions` up to max
    // via the API param. 1536 on the large model is valid (e.g. to match an
    // existing 1536-dim index) and must NOT be rejected.
    const result = validateEmbeddingConfig({
      provider: 'openai',
      model: 'text-embedding-3-large',
      dimensions: 1536,
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('accepts the minimum boundary dimension for a range model (no error)', () => {
    const result = validateEmbeddingConfig({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 1,
    });
    expect(result.errors).toEqual([]);
  });

  it('warns (not errors) on a suspiciously low in-range dimension', () => {
    const result = validateEmbeddingConfig({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 15,
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('unusually low');
  });

  it('does not warn on a normal large reduced dimension', () => {
    const result = validateEmbeddingConfig({
      provider: 'openai',
      model: 'text-embedding-3-large',
      dimensions: 1536,
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('errors on an out-of-range dimension for a range model', () => {
    const result = validateEmbeddingConfig({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 3072,
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('out of range for openai/text-embedding-3-small');
    expect(result.errors[0]).toContain('1–1536');
  });

  it('errors on an off-list dimension for a fixed model', () => {
    const result = validateEmbeddingConfig({
      provider: 'openai',
      model: 'text-embedding-ada-002',
      dimensions: 1024,
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('not valid for openai/text-embedding-ada-002');
    expect(result.errors[0]).toContain('1536');
  });

  it('errors on an unknown provider', () => {
    const result = validateEmbeddingConfig({
      // @ts-expect-error - testing runtime guard for an invalid provider
      provider: 'not-a-real-provider',
      model: 'whatever',
      dimensions: 1024,
    });
    expect(result.errors[0]).toContain('Unknown embeddings.provider');
  });

  it('errors when checkEnv is on and the provider API key is missing', () => {
    const result = validateEmbeddingConfig(
      { provider: 'openai', model: 'text-embedding-3-large', dimensions: 3072 },
      { checkEnv: true, env: {} }
    );
    expect(result.errors.some(e => /OPENAI_API_KEY/.test(e))).toBe(true);
  });

  it('passes the env check when the provider API key is present', () => {
    const result = validateEmbeddingConfig(
      { provider: 'gemini', model: 'gemini-embedding-2-preview', dimensions: 3072 },
      { checkEnv: true, env: { GEMINI_API_KEY: 'test' } }
    );
    expect(result.errors).toEqual([]);
  });

  it('warns (does not error) on an unknown model so new models are not blocked', () => {
    const result = validateEmbeddingConfig({
      provider: 'openai',
      model: 'text-embedding-4-future',
      dimensions: 42,
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Unknown model');
  });

  it('errors when checkEnv is set and the API key env var is missing', () => {
    const result = validateEmbeddingConfig(
      { provider: 'openai', model: 'text-embedding-3-large', dimensions: 3072 },
      { checkEnv: true, env: {} }
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('OPENAI_API_KEY');
  });

  it('passes the env check when the API key is present', () => {
    const result = validateEmbeddingConfig(
      { provider: 'gemini', model: 'gemini-embedding-2-preview', dimensions: 3072 },
      { checkEnv: true, env: { GEMINI_API_KEY: 'x' } }
    );
    expect(result.errors).toEqual([]);
  });
});

describe('validateDimensionMatch', () => {
  it('errors when the index dimension differs from the configured dimension', () => {
    const result = validateDimensionMatch(3072, 1536, 'my-index');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Dimension mismatch');
    expect(result.errors[0]).toContain('my-index');
  });

  it('passes when dimensions match', () => {
    expect(validateDimensionMatch(3072, 3072, 'my-index').errors).toEqual([]);
  });

  it('passes when the index dimension is unknown (undefined)', () => {
    expect(validateDimensionMatch(3072, undefined, 'my-index').errors).toEqual([]);
  });
});

describe('EMBEDDING_PROVIDERS registry', () => {
  it('documents each provider with its API key env var', () => {
    expect(EMBEDDING_PROVIDERS.openai.apiKeyEnvVar).toBe('OPENAI_API_KEY');
    expect(EMBEDDING_PROVIDERS.gemini.apiKeyEnvVar).toBe('GEMINI_API_KEY');
  });

  it('keeps each model default dimension within its own constraint', () => {
    for (const provider of Object.values(EMBEDDING_PROVIDERS)) {
      for (const spec of Object.values(provider.models)) {
        const c = spec.dimensions;
        if (c.kind === 'fixed') {
          expect(c.values).toContain(c.defaultDimension);
        } else {
          expect(c.defaultDimension).toBeGreaterThanOrEqual(c.min);
          expect(c.defaultDimension).toBeLessThanOrEqual(c.max);
        }
      }
    }
  });
});
