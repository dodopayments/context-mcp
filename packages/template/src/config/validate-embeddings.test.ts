import { describe, it, expect } from 'vitest';
import {
  validateEmbeddingConfig,
  validateDimensionMatch,
  EMBEDDING_PROVIDERS,
} from './validate-embeddings.js';

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

  it('accepts the minimum boundary dimension for a range model', () => {
    const result = validateEmbeddingConfig({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 1,
    });
    expect(result.errors).toEqual([]);
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

  it('accepts a keyless provider (ollama) without requiring an API key', () => {
    const result = validateEmbeddingConfig(
      // @ts-expect-error - ollama provider lands with PR #45; registry already knows it
      { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 },
      { checkEnv: true, env: {} }
    );
    expect(result.errors).toEqual([]);
  });

  it('does not warn about unknown models for providers without a model registry', () => {
    const result = validateEmbeddingConfig(
      // @ts-expect-error - cohere provider lands with PR #44; registry already knows it
      { provider: 'cohere', model: 'embed-english-v3.0', dimensions: 1024 },
      {}
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
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
  it('documents key-bearing providers with their API key env vars', () => {
    expect(EMBEDDING_PROVIDERS.openai.apiKeyEnvVar).toBe('OPENAI_API_KEY');
    expect(EMBEDDING_PROVIDERS.gemini.apiKeyEnvVar).toBe('GEMINI_API_KEY');
    expect(EMBEDDING_PROVIDERS.cohere.apiKeyEnvVar).toBe('COHERE_API_KEY');
    expect(EMBEDDING_PROVIDERS.voyage.apiKeyEnvVar).toBe('VOYAGE_API_KEY');
  });

  it('marks the local provider (ollama) as keyless', () => {
    expect(EMBEDDING_PROVIDERS.ollama.apiKeyEnvVar).toBeNull();
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
