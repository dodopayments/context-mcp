import { describe, it, expect } from 'vitest';
import {
  checkNodeVersion,
  checkEnvVar,
  checkConfig,
  countResults,
  hasFailure,
  MIN_NODE_MAJOR,
  type CheckResult,
} from './doctor-checks.js';

describe('checkNodeVersion', () => {
  it('passes for a supported version', () => {
    expect(checkNodeVersion('20.11.0').status).toBe('pass');
    expect(checkNodeVersion(`${MIN_NODE_MAJOR}.0.0`).status).toBe('pass');
  });

  it('fails for an old version', () => {
    const r = checkNodeVersion('16.20.0');
    expect(r.status).toBe('fail');
    expect(r.detail).toContain('requires >=');
  });
});

describe('checkEnvVar', () => {
  it('passes when the var is set', () => {
    expect(checkEnvVar('FOO', { FOO: 'x' }).status).toBe('pass');
  });

  it('fails when the var is missing or empty', () => {
    expect(checkEnvVar('FOO', {}).status).toBe('fail');
    expect(checkEnvVar('FOO', { FOO: '' }).status).toBe('fail');
  });

  it('uses a custom label when provided', () => {
    expect(checkEnvVar('FOO', { FOO: 'x' }, 'Custom').label).toBe('Custom');
  });
});

describe('countResults / hasFailure', () => {
  const results: CheckResult[] = [
    { status: 'pass', label: 'a' },
    { status: 'pass', label: 'b' },
    { status: 'warn', label: 'c' },
    { status: 'fail', label: 'd' },
  ];

  it('counts by status', () => {
    expect(countResults(results)).toEqual({ pass: 2, warn: 1, fail: 1 });
  });

  it('detects failures', () => {
    expect(hasFailure(results)).toBe(true);
    expect(hasFailure([{ status: 'pass', label: 'a' }])).toBe(false);
  });
});

describe('checkConfig', () => {
  const validRaw = {
    vectordb: { provider: 'pinecone', indexName: 'docs' },
    embeddings: { provider: 'openai', model: 'text-embedding-3-large', dimensions: 3072 },
    sources: [{ name: 'docs', type: 'url', url: 'https://example.com/x.json', parser: 'openapi' }],
  };

  it('passes for a valid config with the provider key set', () => {
    const results = checkConfig(validRaw, { OPENAI_API_KEY: 'sk-test' });
    expect(hasFailure(results)).toBe(false);
    expect(results.some(r => r.label === 'Config is valid' && r.status === 'pass')).toBe(true);
    // The OpenAI key check should pass.
    expect(results.some(r => r.label.includes('OPENAI_API_KEY') && r.status === 'pass')).toBe(true);
  });

  it('fails the provider key check when the env var is missing', () => {
    const results = checkConfig(validRaw, {});
    expect(results.some(r => r.label.includes('OPENAI_API_KEY') && r.status === 'fail')).toBe(true);
  });

  it('fails fast on a structurally invalid config', () => {
    const results = checkConfig({ vectordb: {}, sources: [] }, {});
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('fail');
    expect(results[0].label).toBe('Config is valid');
  });
});
