import { describe, it, expect } from 'vitest';
import { clampLimit, formatResults, type SearchResult } from './search.js';

describe('clampLimit', () => {
  it('uses the default when no limit is given', () => {
    expect(clampLimit(undefined, 10, 20)).toBe(10);
  });

  it('caps at maxTopK', () => {
    expect(clampLimit(50, 10, 20)).toBe(20);
  });

  it('enforces a minimum of 1', () => {
    expect(clampLimit(0, 10, 20)).toBe(1);
    expect(clampLimit(-5, 10, 20)).toBe(1);
  });

  it('passes through a valid in-range limit', () => {
    expect(clampLimit(7, 10, 20)).toBe(7);
  });
});

describe('formatResults', () => {
  const results: SearchResult[] = [
    {
      score: 0.9,
      title: 'Auth',
      heading: 'API Keys',
      content: 'Use a bearer token.',
      url: 'https://docs.example.com/auth',
      method: 'GET',
      path: '/v1/keys',
      language: 'http',
    },
  ];

  it('includes a header with the query and result count', () => {
    const out = formatResults(results, 'how to auth', 'MyDocs');
    expect(out).toContain('# MyDocs Documentation');
    expect(out).toContain('> Query: how to auth');
    expect(out).toContain('> Results: 1');
  });

  it('renders title, source, API line, and content', () => {
    const out = formatResults(results, 'q', 'MyDocs');
    expect(out).toContain('## Auth');
    expect(out).toContain('Source: https://docs.example.com/auth');
    expect(out).toContain('API: GET /v1/keys');
    expect(out).toContain('Use a bearer token.');
  });

  it('handles an empty result set', () => {
    const out = formatResults([], 'nothing', 'MyDocs');
    expect(out).toContain('> Results: 0');
  });
});
