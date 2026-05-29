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
import type { DocChunk } from '../types/index.js';

/** Current manifest format version (bump when the hash inputs change). */
export const MANIFEST_VERSION = 1;

export interface ReindexManifest {
  version: number;
  generatedAt: string;
  /** Maps chunk id -> content hash. */
  hashes: Record<string, string>;
}

export interface ReindexDiff {
  /** Chunks that are new or whose content changed — must be embedded + upserted. */
  toUpsert: DocChunk[];
  /** Chunk ids present last run but gone now — must be deleted from the store. */
  toDelete: string[];
  /** Count of chunks whose hash is unchanged (skipped). */
  unchangedCount: number;
}

/**
 * Compute a stable hash of the parts of a chunk that affect its embedding and
 * stored metadata. Changing any of these should trigger a re-embed.
 */
export function hashChunk(chunk: DocChunk): string {
  const hash = createHash('sha256');
  // Order matters and must be stable across runs.
  hash.update(chunk.content);
  hash.update('\u0000');
  hash.update(chunk.heading ?? '');
  hash.update('\u0000');
  hash.update(chunk.documentTitle ?? '');
  hash.update('\u0000');
  hash.update(chunk.metadata?.sourceUrl ?? '');
  hash.update('\u0000');
  hash.update(chunk.metadata?.method ?? '');
  hash.update('\u0000');
  hash.update(chunk.metadata?.path ?? '');
  return hash.digest('hex');
}

/** Build a fresh manifest from the current set of chunks. */
export function buildManifest(chunks: DocChunk[]): ReindexManifest {
  const hashes: Record<string, string> = {};
  for (const chunk of chunks) {
    hashes[chunk.id] = hashChunk(chunk);
  }
  return {
    version: MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
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
 */
export function diffChunks(chunks: DocChunk[], previous: ReindexManifest | null): ReindexDiff {
  const toUpsert: DocChunk[] = [];
  let unchangedCount = 0;

  // Treat a version mismatch as a full reindex.
  const prevHashes =
    previous && previous.version === MANIFEST_VERSION ? previous.hashes : {};

  const currentIds = new Set<string>();

  for (const chunk of chunks) {
    currentIds.add(chunk.id);
    const newHash = hashChunk(chunk);
    const oldHash = prevHashes[chunk.id];
    if (oldHash === newHash) {
      unchangedCount++;
    } else {
      toUpsert.push(chunk);
    }
  }

  // Anything in the previous manifest that's no longer present must be deleted.
  const toDelete: string[] = [];
  for (const id of Object.keys(prevHashes)) {
    if (!currentIds.has(id)) {
      toDelete.push(id);
    }
  }

  return { toUpsert, toDelete, unchangedCount };
}

/**
 * The sanitized id used as the vector id in the store. Must match the
 * transformation applied in chunkToRecord (`id.replace(/[^a-zA-Z0-9_-]/g, '_')`).
 */
export function toVectorId(chunkId: string): string {
  return chunkId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

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
