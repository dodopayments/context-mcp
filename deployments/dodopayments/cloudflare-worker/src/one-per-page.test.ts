import { describe, it, expect } from 'vitest';
import { onePerPage } from './one-per-page';

const r = (url: string, title = 'T') => ({ url, title });

describe('onePerPage', () => {
  it('keeps the first chunk of each page, in rank order', () => {
    const results = [
      r('https://d.com/a#x'),
      r('https://d.com/a#y'),
      r('https://d.com/b'),
      r('https://d.com/a/'),
    ];
    expect(onePerPage(results, 5).map(x => x.url)).toEqual([
      'https://d.com/a#x',
      'https://d.com/b',
    ]);
  });

  it('stops at count', () => {
    const results = [r('https://d.com/a'), r('https://d.com/b'), r('https://d.com/c')];
    expect(onePerPage(results, 2)).toHaveLength(2);
  });

  it('rounds a fractional count down, and never returns fewer than 1', () => {
    const results = [r('https://d.com/a'), r('https://d.com/b'), r('https://d.com/c')];
    expect(onePerPage(results, 1.5)).toHaveLength(1);
    expect(onePerPage(results, 0.2)).toHaveLength(1);
  });

  it('uses the API operation, then the title, when a result has no URL', () => {
    const results = [
      { title: 'Create', method: 'POST', path: '/payments' },
      { title: 'Create again', method: 'POST', path: '/payments' },
      { title: 'List', method: 'GET', path: '/payments' },
      { title: 'Guide' },
      { title: 'Guide' },
    ];
    expect(onePerPage(results, 10).map(x => x.title)).toEqual(['Create', 'List', 'Guide']);
  });
});
