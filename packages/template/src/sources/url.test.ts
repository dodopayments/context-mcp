import { describe, it, expect } from 'vitest';
import { resolveUrlFilename } from './url.js';

describe('resolveUrlFilename', () => {
  it('derives the filename from the URL basename when saveAs is absent', () => {
    expect(resolveUrlFilename('https://example.com/openapi.yaml')).toBe('openapi.yaml');
    expect(resolveUrlFilename('https://example.com/docs/spec.json')).toBe('spec.json');
  });

  it('falls back to content.yaml when the URL path has no basename', () => {
    expect(resolveUrlFilename('https://example.com/')).toBe('content.yaml');
    expect(resolveUrlFilename('https://example.com')).toBe('content.yaml');
  });

  it('uses saveAs verbatim to override the extension', () => {
    expect(resolveUrlFilename('https://dodopayments.com/llms-full.txt', 'llms-full.md')).toBe(
      'llms-full.md'
    );
  });

  it('rejects saveAs values containing path separators or traversal', () => {
    const url = 'https://example.com/x.txt';
    expect(() => resolveUrlFilename(url, '../escape.md')).toThrow(/must be a bare filename/);
    expect(() => resolveUrlFilename(url, 'sub/dir.md')).toThrow(/must be a bare filename/);
    expect(() => resolveUrlFilename(url, 'a\\b.md')).toThrow(/must be a bare filename/);
    expect(() => resolveUrlFilename(url, '.')).toThrow(/must be a bare filename/);
    expect(() => resolveUrlFilename(url, '..')).toThrow(/must be a bare filename/);
  });

  it('rejects an empty or whitespace-only saveAs', () => {
    const url = 'https://example.com/x.txt';
    expect(() => resolveUrlFilename(url, '')).toThrow(/must not be empty/);
    expect(() => resolveUrlFilename(url, '   ')).toThrow(/must not be empty/);
  });

  it('allows consecutive dots inside an otherwise-bare filename', () => {
    expect(resolveUrlFilename('https://example.com/x.txt', 'llms..full.md')).toBe('llms..full.md');
  });
});
