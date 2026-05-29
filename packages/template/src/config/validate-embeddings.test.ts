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

  it('errors on an unsupported dimension for a known model', () => {
    const result = validateEmbeddingConfig({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 3072,
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('not valid for openai/text-embedding-3-small');
    expect(result.errors[0]).toContain('512, 1536');
  });

  it('errors on an unknown provider', () => {
    const result = validateEmbeddingConfig({
      // @ts-expect-error - testing runtime guard for an invalid provider
      provider: 'cohere',
      model: 'whatever',
      dimensions: 1024,
    });
    expect(result.errors[0]).toContain('Unknown embeddings.provider');
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
  it('documents OpenAI and Gemini with API key env vars', () => {
    expect(EMBEDDING_PROVIDERS.openai.apiKeyEnvVar).toBe('OPENAI_API_KEY');
    expect(EMBEDDING_PROVIDERS.gemini.apiKeyEnvVar).toBe('GEMINI_API_KEY');
  });

  it('lists the recommended default dimension within the allowed dimensions', () => {
    for (const provider of Object.values(EMBEDDING_PROVIDERS)) {
      for (const spec of Object.values(provider.models)) {
        expect(spec.dimensions).toContain(spec.defaultDimension);
      }
    }
  });
});
