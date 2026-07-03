import { describe, it, expect } from 'vitest';
import { extractCanonicalUrl, parseMarkdownFile, buildFileSourceUrl } from './markdown-chunker.js';
import type { SourceConfig } from '../../config/schema.js';

function source(partial: Partial<SourceConfig>): SourceConfig {
  return partial as SourceConfig;
}

describe('extractCanonicalUrl', () => {
  it('extracts a plain URL: marker', () => {
    expect(extractCanonicalUrl('URL: https://x.com/a\nmore text')).toBe('https://x.com/a');
  });

  it('extracts a bold/list **URL**: marker', () => {
    expect(extractCanonicalUrl('- **URL**: https://x.com/b')).toBe('https://x.com/b');
  });

  it('strips a trailing period from the captured URL', () => {
    expect(extractCanonicalUrl('URL: https://x.com/e.')).toBe('https://x.com/e');
  });

  it('returns undefined when there is no line-start marker', () => {
    expect(extractCanonicalUrl('see https://x.com/d for details')).toBeUndefined();
    expect(extractCanonicalUrl('no url here, just prose')).toBeUndefined();
  });
});

describe('parseMarkdownFile canonical URL wiring', () => {
  const body = 'Lorem ipsum dolor sit amet consectetur adipiscing elit. '.repeat(8);

  it('uses a section URL marker as the chunk sourceUrl', () => {
    const content = `## Payments\nURL: https://example.com/payments\n\n${body}`;
    const chunks = parseMarkdownFile(content, 'https://fallback.example', 'Test', 'llms-full.md');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every(c => c.metadata.sourceUrl === 'https://example.com/payments')).toBe(true);
  });

  it('falls back to the provided sourceUrl when no marker is present', () => {
    const content = `## Company\n\n${body}`;
    const chunks = parseMarkdownFile(content, 'https://fallback.example', 'Test', 'llms-full.md');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every(c => c.metadata.sourceUrl === 'https://fallback.example')).toBe(true);
  });
});

describe('buildFileSourceUrl', () => {
  it('maps a followLinks page file back to its canonical page URL (no extension)', () => {
    const src = source({
      type: 'url',
      baseUrl: 'https://dodopayments.com',
      followLinks: { hostAllowlist: ['dodopayments.com'], appendExtension: '.md', maxPages: 500 },
    });
    expect(buildFileSourceUrl(src, 'payments.md')).toBe('https://dodopayments.com/payments');
    expect(buildFileSourceUrl(src, 'case-studies/peerpush.md')).toBe(
      'https://dodopayments.com/case-studies/peerpush'
    );
  });

  it('uses the site root for a plain (single-file) url source', () => {
    const src = source({ type: 'url', baseUrl: 'https://dodopayments.com' });
    expect(buildFileSourceUrl(src, 'llms-full.md')).toBe('https://dodopayments.com');
  });

  it('builds a GitHub blob URL for repository sources', () => {
    const src = source({ type: 'github', repository: 'dodopayments/dodopayments-go' });
    expect(buildFileSourceUrl(src, 'README.md')).toBe(
      'https://github.com/dodopayments/dodopayments-go/blob/main/README.md'
    );
  });
});
