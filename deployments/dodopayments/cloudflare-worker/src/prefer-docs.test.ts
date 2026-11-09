import { describe, it, expect } from 'vitest';
import { preferDocs } from './prefer-docs';

const docs = (score: number, path = 'a') => ({ score, url: `https://docs.dodopayments.com/${path}` });
const gh = (score: number, path = 'r') => ({ score, url: `https://github.com/dodopayments/${path}/README.md` });

describe('preferDocs', () => {
  it('ranks a docs page above a slightly better-scored README', () => {
    const out = preferDocs([gh(0.9), docs(0.8)], 0.8);
    expect(out.map(r => r.url)).toEqual([
      'https://docs.dodopayments.com/a',
      'https://github.com/dodopayments/r/README.md',
    ]);
  });

  it('keeps a README first when it is clearly the better match', () => {
    const out = preferDocs([gh(0.9), docs(0.5)], 0.8);
    expect(out[0].url).toContain('github.com');
  });

  it('keeps the original order for equal adjusted scores and for docs-only results', () => {
    const results = [docs(0.7, 'x'), docs(0.7, 'y'), docs(0.6, 'z')];
    expect(preferDocs(results, 0.8)).toEqual(results);
  });

  it('does not change the returned scores', () => {
    const out = preferDocs([gh(0.9), docs(0.8)], 0.8);
    expect(out.map(r => r.score)).toEqual([0.8, 0.9]);
  });

  it('does nothing when the factor is outside (0, 1)', () => {
    const results = [gh(0.9), docs(0.8)];
    for (const f of [0, 1, 1.5, -1, Number.NaN]) expect(preferDocs(results, f)).toEqual(results);
  });

  it('treats results without a URL as docs', () => {
    const noUrl: { score: number; url?: string } = { score: 0.8 };
    const out = preferDocs([gh(0.9), noUrl], 0.8);
    expect(out[0].url).toBeUndefined();
  });
});
