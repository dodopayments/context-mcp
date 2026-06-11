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
  findVectorIdCollisions,
  assertNoVectorIdCollisions,
  sameEmbeddingSignature,
  MANIFEST_VERSION,
  type ReindexManifest,
  type EmbeddingSignature,
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

  const sig = (overrides: Partial<EmbeddingSignature> = {}): EmbeddingSignature => ({
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    ...overrides,
  });

  it('forces a full reindex when the embedding model changed', () => {
    const chunks = [chunk('a', '1'), chunk('b', '2')];
    const prev = buildManifest(chunks, sig());
    // Same content, but a different embedding model -> stored vectors are stale.
    const diff = diffChunks(
      chunks,
      prev,
      sig({ model: 'text-embedding-3-large', dimensions: 3072 })
    );
    expect(diff.toUpsert).toHaveLength(2);
    expect(diff.unchangedCount).toBe(0);
  });

  it('forces a full reindex when only the provider changed', () => {
    const chunks = [chunk('a', '1')];
    const prev = buildManifest(chunks, sig());
    const diff = diffChunks(chunks, prev, sig({ provider: 'gemini' }));
    expect(diff.toUpsert).toHaveLength(1);
    expect(diff.unchangedCount).toBe(0);
  });

  it('still skips unchanged chunks when the embedding signature matches', () => {
    const chunks = [chunk('a', '1'), chunk('b', '2')];
    const prev = buildManifest(chunks, sig());
    const diff = diffChunks(chunks, prev, sig());
    expect(diff.toUpsert).toHaveLength(0);
    expect(diff.unchangedCount).toBe(2);
  });

  it('falls back to content-hash diff when no signature is available (pre-v4 manifest)', () => {
    const chunks = [chunk('a', '1'), chunk('b', 'CHANGED')];
    // Manifest written without a signature; caller still passes one.
    const prev = buildManifest([chunk('a', '1'), chunk('b', '2')]);
    const diff = diffChunks(chunks, prev, sig());
    expect(diff.toUpsert.map(c => c.id)).toEqual(['b']);
    expect(diff.unchangedCount).toBe(1);
  });
});

describe('sameEmbeddingSignature', () => {
  const base = { provider: 'openai', model: 'm', dimensions: 1536 };
  it('is true for identical signatures', () => {
    expect(sameEmbeddingSignature({ ...base }, { ...base })).toBe(true);
  });
  it('is false when any field differs', () => {
    expect(sameEmbeddingSignature(base, { ...base, model: 'other' })).toBe(false);
    expect(sameEmbeddingSignature(base, { ...base, provider: 'gemini' })).toBe(false);
    expect(sameEmbeddingSignature(base, { ...base, dimensions: 768 })).toBe(false);
  });
  it('is false when either side is undefined', () => {
    expect(sameEmbeddingSignature(undefined, base)).toBe(false);
    expect(sameEmbeddingSignature(base, undefined)).toBe(false);
  });
});

describe('toVectorId', () => {
  it('matches the sanitization used by chunkToRecord', () => {
    expect(toVectorId('api-reference/payments#0')).toBe('api-reference_payments_0');
  });
});

// Regression: the manifest keys by raw chunk.id while the store keys by
// toVectorId(chunk.id). Two distinct ids ("a/b#0" and "a_b#0") sanitize to the
// SAME vector id ("a_b_0"). Without guarding this:
//   (1) the store silently keeps only one of two distinct chunks, and
//   (2) the incremental delete path deletes a vector that is STILL live under
//       the colliding id -> permanent, silent data loss.
describe('vector-id collisions (silent-data-loss guard)', () => {
  it('detects two distinct chunk ids that sanitize to the same vector id', () => {
    const collisions = findVectorIdCollisions([chunk('a/b#0', 'one'), chunk('a_b#0', 'two')]);
    expect(collisions.has('a_b_0')).toBe(true);
    expect(collisions.get('a_b_0')!.sort()).toEqual(['a/b#0', 'a_b#0']);
  });

  it('does not flag the SAME id appearing twice (only distinct raw ids collide)', () => {
    // A real duplicate id is a different concern; identical raw ids are not a
    // sanitization collision.
    expect(findVectorIdCollisions([chunk('x#0', 'a'), chunk('x#0', 'b')]).size).toBe(0);
  });

  it('buildManifest throws on a vector-id collision instead of clobbering', () => {
    expect(() => buildManifest([chunk('a/b#0', 'one'), chunk('a_b#0', 'two')])).toThrow(
      /collision/i
    );
  });

  it('diffChunks throws on a vector-id collision instead of deleting a live vector', () => {
    // Previous run had BOTH chunks; now the "a/b#0" one is gone but "a_b#0"
    // remains unchanged. Pre-fix this deleted vector "a_b_0" — the live vector
    // for "a_b#0". The guard must refuse to produce that diff.
    const c1 = chunk('a_b#0', 'lives');
    const c2 = chunk('a/b#0', 'removed');
    const prev = buildManifestUnsafe([c1, c2]); // simulate a legacy/colliding manifest
    expect(() => diffChunks([c1], prev)).not.toThrow(); // only c1 -> no collision now
    // But if both are present and collide, we must throw:
    expect(() => diffChunks([c1, c2], null)).toThrow(/collision/i);
  });

  it('assertNoVectorIdCollisions passes for distinct vector ids', () => {
    expect(() =>
      assertNoVectorIdCollisions([chunk('a/b#0', 'x'), chunk('c/d#0', 'y')])
    ).not.toThrow();
  });
});

// Regression: manifest is keyed by VECTOR id, so the delete set contains
// already-sanitized vector ids ready to hand straight to the store (no
// double-transform). A removed chunk whose id needs sanitizing must surface its
// vector id (not its raw id) in toDelete.
describe('diffChunks keys by vector id', () => {
  it('emits already-sanitized vector ids in toDelete', () => {
    const prev = buildManifest([chunk('api/ref#0', '1'), chunk('api/ref#1', '2')]);
    const diff = diffChunks([chunk('api/ref#0', '1')], prev);
    // The removed chunk "api/ref#1" must appear as its vector id "api_ref_1".
    expect(diff.toDelete).toEqual(['api_ref_1']);
    expect(diff.toDelete.every(id => id === toVectorId(id))).toBe(true);
  });

  it('matches unchanged chunks across the raw-id -> vector-id boundary', () => {
    const c = chunk('api/ref#0', 'stable');
    const prev = buildManifest([c]);
    const diff = diffChunks([c], prev);
    expect(diff.unchangedCount).toBe(1);
    expect(diff.toUpsert).toHaveLength(0);
    expect(diff.toDelete).toHaveLength(0);
  });
});

// Helper that bypasses the collision guard to construct a legacy-style manifest
// for tests that need to simulate a pre-fix on-disk state.
function buildManifestUnsafe(chunks: DocChunk[]): ReindexManifest {
  const hashes: Record<string, string> = {};
  for (const c of chunks) hashes[toVectorId(c.id)] = hashChunk(c);
  return { version: MANIFEST_VERSION, generatedAt: 'x', hashes };
}

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
