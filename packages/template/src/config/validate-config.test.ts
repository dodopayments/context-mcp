import { describe, it, expect } from 'vitest';
import { stringify as toYaml } from 'yaml';
import {
  findConfigFile,
  validateConfigObject,
  validateConfigText,
  CONFIG_PATHS,
} from './validate-config.js';

const validConfig = {
  vectordb: { provider: 'pinecone', indexName: 'docs' },
  embeddings: { provider: 'openai', model: 'text-embedding-3-large', dimensions: 3072 },
  sources: [{ name: 'docs', type: 'url', url: 'https://example.com/openapi.json', parser: 'openapi' }],
};

describe('findConfigFile', () => {
  it('returns the first path that exists', () => {
    const exists = (p: string) => p === 'config/config.yaml';
    expect(findConfigFile(CONFIG_PATHS, exists)).toBe('config/config.yaml');
  });

  it('returns null when none exist', () => {
    expect(findConfigFile(CONFIG_PATHS, () => false)).toBeNull();
  });

  it('respects priority order', () => {
    // Both config.yaml and config.yml "exist" — first in list wins.
    const exists = (p: string) => p === 'config.yaml' || p === 'config.yml';
    expect(findConfigFile(CONFIG_PATHS, exists)).toBe('config.yaml');
  });
});

describe('validateConfigObject', () => {
  it('accepts a valid config and produces a summary', () => {
    const result = validateConfigObject(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.summary.join(' ')).toContain('1 source(s)');
    expect(result.summary.join(' ')).toContain('pinecone / docs');
  });

  it('reports a missing indexName with a field path', () => {
    const bad = { ...validConfig, vectordb: { provider: 'pinecone' } };
    const result = validateConfigObject(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('vectordb.indexName'))).toBe(true);
  });

  it('reports an empty sources array', () => {
    const bad = { ...validConfig, sources: [] };
    const result = validateConfigObject(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('source'))).toBe(true);
  });

  it('rejects an invalid source name (uppercase)', () => {
    const bad = { ...validConfig, sources: [{ ...validConfig.sources[0], name: 'Docs' }] };
    const result = validateConfigObject(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.startsWith('sources.0.name'))).toBe(true);
  });

  it('flags an embedding dimension/model mismatch', () => {
    const bad = {
      ...validConfig,
      embeddings: { provider: 'openai', model: 'text-embedding-3-large', dimensions: 1536 },
    };
    const result = validateConfigObject(bad);
    // validateEmbeddingConfig should object to large model with 1536 dims.
    expect(result.errors.length + result.warnings.length).toBeGreaterThan(0);
  });
});

describe('validateConfigText', () => {
  it('parses and validates YAML text', () => {
    const result = validateConfigText(toYaml(validConfig));
    expect(result.valid).toBe(true);
  });

  it('returns a YAML parse error rather than throwing', () => {
    const result = validateConfigText('foo: [unclosed');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/parse YAML/i);
  });

  it('reports a structural error for non-object YAML', () => {
    const result = validateConfigText('"just a string"');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
