import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  parseTxtArgs,
  resolvePaths,
  shouldRefuseOverwrite,
  formatChunks,
  type TxtChunk,
} from './index-to-txt-lib.js';

describe('parseTxtArgs', () => {
  it('defaults to no flags', () => {
    expect(parseTxtArgs([])).toEqual({ force: false, help: false });
  });

  it('parses --input/-i and --output/-o', () => {
    expect(parseTxtArgs(['--input', 'a.json', '--output', 'b.txt'])).toMatchObject({
      input: 'a.json',
      output: 'b.txt',
    });
    expect(parseTxtArgs(['-i', 'a.json', '-o', 'b.txt'])).toMatchObject({
      input: 'a.json',
      output: 'b.txt',
    });
  });

  it('parses --force and --help', () => {
    expect(parseTxtArgs(['--force']).force).toBe(true);
    expect(parseTxtArgs(['-h']).help).toBe(true);
  });
});

describe('resolvePaths', () => {
  const dataDir = '/proj/data';

  it('uses defaults inside dataDir when no flags given', () => {
    const { inputPath, outputPath } = resolvePaths({}, dataDir);
    expect(inputPath).toBe(path.join(dataDir, 'chunks-index.json'));
    expect(outputPath).toBe(path.join(dataDir, 'chunks-full.txt'));
  });

  it('resolves explicit input/output against CWD', () => {
    const { inputPath, outputPath } = resolvePaths({ input: 'in.json', output: 'out.txt' }, dataDir);
    expect(inputPath).toBe(path.resolve('in.json'));
    expect(outputPath).toBe(path.resolve('out.txt'));
  });
});

describe('shouldRefuseOverwrite', () => {
  it('refuses when output exists and not forced', () => {
    expect(shouldRefuseOverwrite(true, false)).toBe(true);
  });

  it('allows when forced', () => {
    expect(shouldRefuseOverwrite(true, true)).toBe(false);
  });

  it('allows when output does not exist', () => {
    expect(shouldRefuseOverwrite(false, false)).toBe(false);
  });
});

describe('formatChunks', () => {
  const chunk = (over: Partial<TxtChunk> = {}): TxtChunk => ({
    documentTitle: 'Payments',
    heading: 'Create a payment',
    content: 'POST a payment object.',
    metadata: {},
    ...over,
  });

  it('emits a header with the chunk count', () => {
    const out = formatChunks([chunk(), chunk()]);
    expect(out).toContain('# Documentation');
    expect(out).toContain('> Total chunks: 2');
  });

  it('includes title, heading, source, API and language when present', () => {
    const out = formatChunks([
      chunk({
        metadata: { sourceUrl: 'https://d/x', method: 'POST', path: '/v1/pay', language: 'json' },
      }),
    ]);
    expect(out).toContain('## Payments');
    expect(out).toContain('Heading: Create a payment');
    expect(out).toContain('Source: https://d/x');
    expect(out).toContain('API: POST /v1/pay');
    expect(out).toContain('Language: json');
    expect(out).toContain('POST a payment object.');
  });

  it('omits the heading line when it equals the title', () => {
    const out = formatChunks([chunk({ heading: 'Payments' })]);
    expect(out).not.toContain('Heading: Payments');
  });

  it('handles empty content without throwing', () => {
    const out = formatChunks([chunk({ content: '' })]);
    expect(out).toContain('## Payments');
  });
});
