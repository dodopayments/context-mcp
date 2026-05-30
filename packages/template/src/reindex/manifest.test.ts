import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  hashChunk,
  buildManifest,
  diffChunks,
  toVectorId,
  loadManifest,
  saveManifest,
  MANIFEST_VERSION,
  type ReindexManifest,
} from './manifest.js';
import type { DocChunk } from '../types/index.js';

function chunk(id: string, content: string, overrides: Partial<DocChunk> = {}): DocChunk {
  return {
    id,
    documentPath: 'doc.md',
    documentTitle: 'Doc',
    category: 'docs',
    heading: 'Heading',
    content,
    metadata: {},
    ...overrides,
  };
}

describe('hashChunk', () => {
  it('is deterministic for identical content', () => {
    expect(hashChunk(chunk('a', 'hello'))).toBe(hashChunk(chunk('a', 'hello')));
  });

  it('changes when content changes', () => {
    expect(hashChunk(chunk('a', 'hello'))).not.toBe(hashChunk(chunk('a', 'world')));
  });

  it('changes when heading changes', () => {
    const c1 = chunk('a', 'x', { heading: 'H1' });
    const c2 = chunk('a', 'x', { heading: 'H2' });
    expect(hashChunk(c1)).not.toBe(hashChunk(c2));
  });

  it('changes when relevant metadata (sourceUrl) changes', () => {
    const c1 = chunk('a', 'x', { metadata: { sourceUrl: 'https://a' } });
    const c2 = chunk('a', 'x', { metadata: { sourceUrl: 'https://b' } });
    expect(hashChunk(c1)).not.toBe(hashChunk(c2));
  });

  // Regression: these fields drive the embedding input or the stored metadata,
  // so a change in any of them must change the hash (else stale vectors).
  it.each([
    ['repository (embedding input)', { repository: 'org/repo-a' }, { repository: 'org/repo-b' }],
    ['language (embedding input)', { language: 'typescript' }, { language: 'python' }],
    ['description (embedding input)', { description: 'old desc' }, { description: 'new desc' }],
    ['version (stored metadata)', { version: '1.0.0' }, { version: '2.0.0' }],
  ])('changes when %s changes', (_label, metaA, metaB) => {
    const c1 = chunk('a', 'x', { metadata: metaA });
    const c2 = chunk('a', 'x', { metadata: metaB });
    expect(hashChunk(c1)).not.toBe(hashChunk(c2));
  });

  it.each([
    ['category (stored metadata)', { category: 'guides' }, { category: 'reference' }],
    ['documentPath (stored metadata)', { documentPath: 'a.md' }, { documentPath: 'b.md' }],
    ['documentTitle (embedding input)', { documentTitle: 'A' }, { documentTitle: 'B' }],
  ])('changes when top-level %s changes', (_label, a, b) => {
    const c1 = chunk('a', 'x', a);
    const c2 = chunk('a', 'x', b);
    expect(hashChunk(c1)).not.toBe(hashChunk(c2));
  });

  it('ignores the id (only content-relevant fields are hashed)', () => {
    expect(hashChunk(chunk('a', 'same'))).toBe(hashChunk(chunk('b', 'same')));
  });
});

describe('buildManifest', () => {
  it('maps every chunk id to its hash with the current version', () => {
    const m = buildManifest([chunk('a', '1'), chunk('b', '2')]);
    expect(m.version).toBe(MANIFEST_VERSION);
    expect(Object.keys(m.hashes)).toEqual(['a', 'b']);
    expect(m.hashes.a).toBe(hashChunk(chunk('a', '1')));
  });
});

describe('diffChunks', () => {
  it('treats everything as new when there is no previous manifest', () => {
    const chunks = [chunk('a', '1'), chunk('b', '2')];
    const diff = diffChunks(chunks, null);
    expect(diff.toUpsert).toHaveLength(2);
    expect(diff.toDelete).toHaveLength(0);
    expect(diff.unchangedCount).toBe(0);
  });

  it('skips unchanged chunks', () => {
    const chunks = [chunk('a', '1'), chunk('b', '2')];
    const prev = buildManifest(chunks);
    const diff = diffChunks(chunks, prev);
    expect(diff.toUpsert).toHaveLength(0);
    expect(diff.unchangedCount).toBe(2);
    expect(diff.toDelete).toHaveLength(0);
  });

  it('detects new and changed chunks', () => {
    const prev = buildManifest([chunk('a', '1'), chunk('b', '2')]);
    const current = [chunk('a', '1'), chunk('b', 'CHANGED'), chunk('c', '3')];
    const diff = diffChunks(current, prev);
    const ids = diff.toUpsert.map(c => c.id).sort();
    expect(ids).toEqual(['b', 'c']); // b changed, c is new
    expect(diff.unchangedCount).toBe(1); // a unchanged
    expect(diff.toDelete).toHaveLength(0);
  });

  it('detects removed chunks', () => {
    const prev = buildManifest([chunk('a', '1'), chunk('b', '2'), chunk('c', '3')]);
    const current = [chunk('a', '1')];
    const diff = diffChunks(current, prev);
    expect(diff.unchangedCount).toBe(1);
    expect(diff.toUpsert).toHaveLength(0);
    expect(diff.toDelete.sort()).toEqual(['b', 'c']);
  });

  it('forces a full reindex when the manifest version differs', () => {
    const chunks = [chunk('a', '1')];
    const stale: ReindexManifest = {
      version: MANIFEST_VERSION + 1,
      generatedAt: '2020-01-01',
      hashes: { a: hashChunk(chunk('a', '1')) },
    };
    const diff = diffChunks(chunks, stale);
    expect(diff.toUpsert).toHaveLength(1);
    expect(diff.unchangedCount).toBe(0);
  });
});

describe('toVectorId', () => {
  it('matches the sanitization used by chunkToRecord', () => {
    expect(toVectorId('api-reference/payments#0')).toBe('api-reference_payments_0');
  });
});

describe('manifest persistence', () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips through save/load', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'manifest-'));
    const file = path.join(dir, 'nested', 'manifest.json');
    const manifest = buildManifest([chunk('a', '1')]);
    saveManifest(file, manifest);
    const loaded = loadManifest(file);
    expect(loaded).toEqual(manifest);
  });

  it('returns null for a missing file', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'manifest-'));
    expect(loadManifest(path.join(dir, 'nope.json'))).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'manifest-'));
    const file = path.join(dir, 'bad.json');
    writeFileSync(file, '{ not valid json');
    expect(loadManifest(file)).toBeNull();
  });

  it('returns null for a structurally invalid manifest', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'manifest-'));
    const file = path.join(dir, 'invalid.json');
    writeFileSync(file, JSON.stringify({ foo: 'bar' }));
    expect(loadManifest(file)).toBeNull();
  });
});
