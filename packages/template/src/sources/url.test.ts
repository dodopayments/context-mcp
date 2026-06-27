import { describe, it, expect } from 'vitest';
import { resolveUrlFilename, extractSeedLinks } from './url.js';

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

describe('extractSeedLinks', () => {
  const seed = `# Index
- [Payments](https://dodopayments.com/payments): accept payments.
- [Pricing](https://dodopayments.com/pricing).
- [Docs](https://docs.dodopayments.com/intro) external host.
- duplicate (https://dodopayments.com/payments)
- root link https://dodopayments.com/ and https://dodopayments.com
- [Case](https://dodopayments.com/case-studies/peerpush?utm=x#top)
`;

  it('extracts, dedupes and sorts apex links within the host allowlist', () => {
    expect(extractSeedLinks(seed, ['dodopayments.com'])).toEqual([
      'https://dodopayments.com/case-studies/peerpush',
      'https://dodopayments.com/payments',
      'https://dodopayments.com/pricing',
    ]);
  });

  it('excludes hosts outside the allowlist', () => {
    expect(extractSeedLinks(seed, ['dodopayments.com'])).not.toContain(
      'https://docs.dodopayments.com/intro'
    );
  });

  it('drops query, fragment, trailing slash and the bare host root', () => {
    const links = extractSeedLinks(seed, ['dodopayments.com']);
    expect(links).toContain('https://dodopayments.com/case-studies/peerpush');
    expect(links).not.toContain('https://dodopayments.com');
    expect(links).not.toContain('https://dodopayments.com/');
  });

  it('returns all hosts when the allowlist is empty', () => {
    expect(extractSeedLinks(seed)).toContain('https://docs.dodopayments.com/intro');
  });
});
