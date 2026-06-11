import { describe, it, expect } from 'vitest';
import { parseCleanArgs, resolveDeletion, isAbortError } from './clean-vectors-cli.js';

describe('parseCleanArgs', () => {
  it('defaults to no flags', () => {
    expect(parseCleanArgs([])).toEqual({ force: false, help: false, unknown: [] });
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

  it('collects unknown flags instead of silently ignoring them', () => {
    const args = parseCleanArgs(['--forse', 'extra']);
    expect(args.force).toBe(false);
    expect(args.unknown).toEqual(['--forse', 'extra']);
  });

  it('flags a dangling --config with no value', () => {
    const args = parseCleanArgs(['--config']);
    expect(args.config).toBeUndefined();
    expect(args.unknown).toEqual(['--config (missing value)']);
  });

  it('treats --config followed by another flag as a missing value', () => {
    const args = parseCleanArgs(['--config', '--force']);
    expect(args.config).toBeUndefined();
    expect(args.force).toBe(true);
    expect(args.unknown).toContain('--config (missing value)');
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
    const d = resolveDeletion({
      force: false,
      isTTY: true,
      indexName: 'docs',
      answer: '  docs \n',
    });
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

describe('isAbortError', () => {
  it('detects the AbortError raised by readline on Ctrl+C / Ctrl+D', () => {
    // node:readline/promises rejects rl.question() with this shape on SIGINT/EOF.
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    (err as { code?: string }).code = 'ABORT_ERR';
    expect(isAbortError(err)).toBe(true);
  });

  it('detects by name even when code is absent', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('detects by code even when name differs', () => {
    const err = new Error('aborted');
    (err as { code?: string }).code = 'ABORT_ERR';
    expect(isAbortError(err)).toBe(true);
  });

  it('matches the real DOMException-style AbortError thrown via AbortController', () => {
    const ac = new AbortController();
    ac.abort();
    expect(ac.signal.reason).toBeInstanceOf(Error);
    expect(isAbortError(ac.signal.reason)).toBe(true);
  });

  it('does not treat ordinary errors as aborts', () => {
    expect(isAbortError(new Error('connection refused'))).toBe(false);
    const typeErr = new TypeError('bad');
    expect(isAbortError(typeErr)).toBe(false);
  });

  it('is safe for non-Error values', () => {
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
    expect(isAbortError({ name: 'AbortError', code: 'ABORT_ERR' })).toBe(false);
  });
});
