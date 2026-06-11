/**
 * Incremental reindex manifest + diff logic
 *
 * To avoid re-embedding (and re-uploading) every chunk on each run, we persist
 * a manifest mapping each chunk id to a hash of its embedding-relevant content.
 * On the next run we diff the freshly parsed chunks against the manifest and
 * only embed/upsert what's new or changed, and delete what disappeared.
 *
 * The manifest is intentionally small (id -> hash) so it can live in the repo's
 * `data/` directory or any persistent storage between CI runs.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { type DocChunk, toVectorId } from '../types/index.js';

/**
 * Current manifest format version. Bump whenever the hash inputs change so old
 * manifests are treated as a full reindex rather than silently skipping chunks
 * whose embedding/metadata changed under the old (narrower) hash.
 *
 * v2: hash now also covers repository/language/description (embedding inputs)
 *     and category/version/documentPath (stored metadata).
 * v3: manifest is now keyed by the *vector id* (`toVectorId(chunk.id)`) — the
 *     SAME identity the store uses — instead of the raw `chunk.id`. Keying by the
 *     raw id let two distinct chunks whose ids sanitize to the same vector id
 *     (e.g. "a/b#0" and "a_b#0" both -> "a_b_0") diverge between the manifest and
 *     the store, causing the delete path to clobber a live vector. Bumping forces
 *     a full reindex so the manifest is rebuilt in the correct (vector-id) space.
 * v4: manifest now records the embedding *signature* (provider/model/dimensions).
 *     A content hash only detects changes to a chunk's text/metadata — it can't
 *     see that the embedding MODEL changed. Without this, switching providers or
 *     models (e.g. openai text-embedding-3-small -> gemini, or 1536 -> 768 dims)
 *     would leave every "unchanged" chunk pointing at a stale vector embedded by
 *     the OLD model, silently corrupting search quality. A signature mismatch is
 *     now treated as a full reindex so the whole index is re-embedded.
 */
export const MANIFEST_VERSION = 4;

/**
 * Identifies which embedding model produced the vectors a manifest describes.
 * If any field changes between runs the stored vectors are no longer comparable
 * to freshly embedded ones, so the manifest must be invalidated (full reindex).
 */
export interface EmbeddingSignature {
  provider: string;
  model: string;
  dimensions: number;
}

export interface ReindexManifest {
  version: number;
  generatedAt: string;
  /**
   * The embedding model that produced the indexed vectors. Optional for
   * backward-compat when loading pre-v4 manifests, but always written on save.
   */
  embedding?: EmbeddingSignature;
  /** Maps chunk id -> content hash. */
  hashes: Record<string, string>;
}

/** True if two embedding signatures describe the same model/provider/dimension. */
export function sameEmbeddingSignature(
  a: EmbeddingSignature | undefined,
  b: EmbeddingSignature | undefined
): boolean {
  if (!a || !b) return false;
  return a.provider === b.provider && a.model === b.model && a.dimensions === b.dimensions;
}

export interface ReindexDiff {
  /** Chunks that are new or whose content changed — must be embedded + upserted. */
  toUpsert: DocChunk[];
  /**
   * VECTOR ids present last run but gone now — must be deleted from the store.
   * These are already `toVectorId()`-sanitized (the manifest is keyed by vector
   * id), so callers must pass them straight to the store WITHOUT re-sanitizing.
   */
  toDelete: string[];
  /** Count of chunks whose hash is unchanged (skipped). */
  unchangedCount: number;
}

/**
 * Compute a stable hash of the parts of a chunk that affect its embedding and
 * its stored metadata. Changing any of these should trigger a re-embed/upsert.
 *
 * The field set must stay in sync with two places:
 *  - `prepareChunkForEmbedding` (what actually gets embedded): content,
 *    heading, documentTitle, repository, language, description, method, path.
 *  - `chunkToRecord` metadata (what's stored alongside the vector): also
 *    category, version, documentPath, sourceUrl.
 *
 * Missing any of these means an edit to that field would NOT re-embed/re-upsert
 * the chunk, leaving a stale vector or stale metadata in the store.
 */
export function hashChunk(chunk: DocChunk): string {
  const hash = createHash('sha256');
  // Order matters and must be stable across runs. A NUL separator after every
  // field keeps boundaries unambiguous (avoids "ab"+"c" colliding with "a"+"bc").
  const fields = [
    chunk.content,
    chunk.heading,
    chunk.documentTitle,
    chunk.documentPath,
    chunk.category,
    chunk.metadata?.sourceUrl,
    chunk.metadata?.repository,
    chunk.metadata?.language,
    chunk.metadata?.description,
    chunk.metadata?.method,
    chunk.metadata?.path,
    chunk.metadata?.version,
  ];
  for (const field of fields) {
    hash.update(field ?? '');
    hash.update('\u0000');
  }
  return hash.digest('hex');
}

/**
 * Detect chunks whose ids sanitize to the SAME vector id. Because the store is
 * keyed by `toVectorId(chunk.id)` (a non-injective transform: every char outside
 * [a-zA-Z0-9_-] becomes '_'), two distinct chunk ids like "a/b#0" and "a_b#0"
 * both collapse to "a_b_0". The store can only hold one vector for that id, so
 * the other chunk is silently dropped — and the incremental delete path can even
 * remove a *live* vector. This must be surfaced loudly, never tolerated.
 *
 * Returns a map of vectorId -> the colliding raw chunk ids (length >= 2).
 */
export function findVectorIdCollisions(chunks: DocChunk[]): Map<string, string[]> {
  const byVectorId = new Map<string, string[]>();
  for (const chunk of chunks) {
    const vid = toVectorId(chunk.id);
    const ids = byVectorId.get(vid);
    if (ids) {
      if (!ids.includes(chunk.id)) ids.push(chunk.id);
    } else {
      byVectorId.set(vid, [chunk.id]);
    }
  }
  const collisions = new Map<string, string[]>();
  for (const [vid, ids] of byVectorId) {
    if (ids.length > 1) collisions.set(vid, ids);
  }
  return collisions;
}

/**
 * Throw if any two distinct chunk ids collide to the same vector id. Call this
 * before building a manifest / uploading so silent data loss is impossible.
 */
export function assertNoVectorIdCollisions(chunks: DocChunk[]): void {
  const collisions = findVectorIdCollisions(chunks);
  if (collisions.size === 0) return;
  const details = [...collisions.entries()]
    .map(([vid, ids]) => `  ${vid} <- ${ids.map(id => JSON.stringify(id)).join(', ')}`)
    .join('\n');
  throw new Error(
    `Vector id collision: ${collisions.size} distinct chunk id group(s) sanitize to the same ` +
      `vector id, which would silently overwrite/delete each other in the store:\n${details}\n` +
      `Make the chunk ids unique after toVectorId() sanitization.`
  );
}

/**
 * Build a fresh manifest from the current set of chunks.
 *
 * Keyed by VECTOR id (`toVectorId(chunk.id)`) so the manifest lives in the exact
 * same identity space as the store. Throws on vector-id collisions rather than
 * letting one chunk silently clobber another's hash.
 *
 * `embedding` records which model produced the vectors so a later run can detect
 * a model/provider/dimension change and force a full reindex.
 */
export function buildManifest(chunks: DocChunk[], embedding?: EmbeddingSignature): ReindexManifest {
  assertNoVectorIdCollisions(chunks);
  const hashes: Record<string, string> = {};
  for (const chunk of chunks) {
    hashes[toVectorId(chunk.id)] = hashChunk(chunk);
  }
  return {
    version: MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    ...(embedding ? { embedding } : {}),
    hashes,
  };
}

/**
 * Diff freshly parsed chunks against a previous manifest.
 *
 * - new id, or id whose hash changed -> toUpsert
 * - id in manifest but not in current chunks -> toDelete
 * - id whose hash matches -> unchanged (skipped)
 *
 * If `previous` is null (first run / version mismatch), every chunk is upserted.
 *
 * `currentEmbedding` is the signature of the model about to be used. If it
 * differs from the manifest's recorded signature, the stored vectors were
 * produced by a different model and are no longer comparable — so we ignore the
 * old hashes entirely and re-embed every chunk (full reindex).
 */
export function diffChunks(
  chunks: DocChunk[],
  previous: ReindexManifest | null,
  currentEmbedding?: EmbeddingSignature
): ReindexDiff {
  // Guard first: if two chunks collide to the same vector id we cannot reason
  // about the diff at all (their hashes and the store entry are aliased). Fail
  // loudly instead of silently deleting/overwriting one of them.
  assertNoVectorIdCollisions(chunks);

  const toUpsert: DocChunk[] = [];
  let unchangedCount = 0;

  // Treat a version mismatch OR an embedding-model change as a full reindex.
  // For the model change we only invalidate when BOTH signatures are known and
  // differ — an absent signature (pre-v4 manifest, or caller didn't pass one)
  // falls back to the prior content-hash-only behaviour.
  const embeddingChanged =
    !!currentEmbedding &&
    !!previous?.embedding &&
    !sameEmbeddingSignature(previous.embedding, currentEmbedding);
  const versionMatches = previous?.version === MANIFEST_VERSION;
  const prevHashes = previous && versionMatches && !embeddingChanged ? previous.hashes : {};

  // Track CURRENT vector ids (same identity space as the manifest keys).
  const currentVectorIds = new Set<string>();

  for (const chunk of chunks) {
    const vectorId = toVectorId(chunk.id);
    currentVectorIds.add(vectorId);
    const newHash = hashChunk(chunk);
    const oldHash = prevHashes[vectorId];
    if (oldHash === newHash) {
      unchangedCount++;
    } else {
      toUpsert.push(chunk);
    }
  }

  // Anything in the previous manifest (already a vector id) that's no longer
  // present must be deleted. Comparing vector id to vector id ensures we never
  // delete a vector that is still live under a colliding raw id.
  const toDelete: string[] = [];
  for (const vectorId of Object.keys(prevHashes)) {
    if (!currentVectorIds.has(vectorId)) {
      toDelete.push(vectorId);
    }
  }

  return { toUpsert, toDelete, unchangedCount };
}

// Re-exported from a single source of truth in ../types so the manifest's
// delete path and chunkToRecord's upsert path can never drift apart.
export { toVectorId } from '../types/index.js';

// =============================================================================
// PERSISTENCE
// =============================================================================

/** Load a manifest from disk, returning null if missing or invalid. */
export function loadManifest(filePath: string): ReindexManifest | null {
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as ReindexManifest;
    if (typeof parsed?.version !== 'number' || typeof parsed?.hashes !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Persist a manifest to disk (creating parent dirs as needed). */
export function saveManifest(filePath: string, manifest: ReindexManifest): void {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(manifest, null, 2));
}
