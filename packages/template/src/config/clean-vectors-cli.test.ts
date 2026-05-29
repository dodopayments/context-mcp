import { describe, it, expect } from 'vitest';
import { parseCleanArgs, resolveDeletion } from './clean-vectors-cli.js';

describe('parseCleanArgs', () => {
  it('defaults to no flags', () => {
    expect(parseCleanArgs([])).toEqual({ force: false, help: false });
  });

  it('parses --force and -f', () => {
    expect(parseCleanArgs(['--force']).force).toBe(true);
    expect(parseCleanArgs(['-f']).force).toBe(true);
  });

  it('parses --help and -h', () => {
    expect(parseCleanArgs(['--help']).help).toBe(true);
    expect(parseCleanArgs(['-h']).help).toBe(true);
  });

  it('parses --config <path>', () => {
    expect(parseCleanArgs(['--config', 'ci.yaml']).config).toBe('ci.yaml');
    expect(parseCleanArgs(['-c', 'ci.yaml']).config).toBe('ci.yaml');
  });
});

describe('resolveDeletion', () => {
  it('proceeds when --force is set (even non-interactive)', () => {
    expect(resolveDeletion({ force: true, isTTY: false, indexName: 'docs' })).toEqual({
      proceed: true,
      reason: 'forced',
    });
  });

  it('refuses in a non-interactive shell without --force', () => {
    expect(resolveDeletion({ force: false, isTTY: false, indexName: 'docs' })).toEqual({
      proceed: false,
      reason: 'non-interactive',
    });
  });

  it('proceeds when the typed answer matches the index name', () => {
    const d = resolveDeletion({ force: false, isTTY: true, indexName: 'docs', answer: 'docs' });
    expect(d).toEqual({ proceed: true, reason: 'confirmed' });
  });

  it('trims whitespace around the answer', () => {
    const d = resolveDeletion({ force: false, isTTY: true, indexName: 'docs', answer: '  docs \n' });
    expect(d.proceed).toBe(true);
  });

  it('refuses on a mismatched answer', () => {
    const d = resolveDeletion({ force: false, isTTY: true, indexName: 'docs', answer: 'wrong' });
    expect(d).toEqual({ proceed: false, reason: 'mismatch' });
  });

  it('refuses when no answer is given interactively', () => {
    const d = resolveDeletion({ force: false, isTTY: true, indexName: 'docs' });
    expect(d.proceed).toBe(false);
    expect(d.reason).toBe('mismatch');
  });

  it('is case-sensitive (does not proceed on case mismatch)', () => {
    const d = resolveDeletion({ force: false, isTTY: true, indexName: 'docs', answer: 'DOCS' });
    expect(d.proceed).toBe(false);
  });
});
