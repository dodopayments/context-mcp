/**
 * Local manifest helpers for incremental reindexing.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { ChunkConfig, DocChunk } from '../types/index.js';
import { buildChunkMetadata, getPineconeRecordId, prepareChunkForEmbedding } from './core.js';

export const INDEX_MANIFEST_VERSION = 1;

export interface EmbeddingSignature {
  provider: string;
  model: string;
  dimensions: number;
}

export interface ManifestChunk {
  rawId: string;
  sourceName: string;
  hash: string;
  documentPath: string;
  heading: string;
  embeddingHash?: string;
  chunkingHash?: string;
}

export interface IndexManifest {
  version: typeof INDEX_MANIFEST_VERSION;
  generatedAt: string;
  indexName: string;
  embedding: EmbeddingSignature;
  chunking: ChunkConfig;
  chunks: Record<string, ManifestChunk>;
}

export interface IndexedChunk extends ManifestChunk {
  chunk: DocChunk;
  recordId: string;
  embeddingHash: string;
  chunkingHash: string;
}

export interface DeletedManifestChunk extends ManifestChunk {
  recordId: string;
}

export interface ManifestDiff {
  added: IndexedChunk[];
  updated: IndexedChunk[];
  unchanged: IndexedChunk[];
  deleted: DeletedManifestChunk[];
}

export function getManifestPath(cwd: string = process.cwd()): string {
  return path.join(cwd, 'data', 'index-manifest.json');
}

export function loadIndexManifest(manifestPath: string): IndexManifest | undefined {
  if (!fs.existsSync(manifestPath)) {
    return undefined;
  }

  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Partial<IndexManifest>;
  return normalizeManifest(parsed);
}

export function saveIndexManifest(manifestPath: string, manifest: IndexManifest): void {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

export function createIndexedChunk(
  chunk: DocChunk,
  sourceName: string,
  embedding: EmbeddingSignature,
  chunking: ChunkConfig
): IndexedChunk {
  return {
    chunk,
    recordId: getPineconeRecordId(chunk),
    rawId: chunk.id,
    sourceName,
    hash: computeChunkHash(chunk),
    documentPath: chunk.documentPath,
    heading: chunk.heading,
    embeddingHash: hashStableValue(embedding),
    chunkingHash: hashStableValue(chunking),
  };
}

export function assertUniqueRecordIds(indexedChunks: IndexedChunk[]): void {
  const seen = new Map<string, IndexedChunk>();

  for (const indexedChunk of indexedChunks) {
    const previous = seen.get(indexedChunk.recordId);
    if (!previous) {
      seen.set(indexedChunk.recordId, indexedChunk);
      continue;
    }

    throw new Error(
      [
        `Duplicate Pinecone record id '${indexedChunk.recordId}' generated during parsing.`,
        `First chunk: ${previous.rawId} (${previous.sourceName})`,
        `Second chunk: ${indexedChunk.rawId} (${indexedChunk.sourceName})`,
      ].join(' ')
    );
  }
}

export function diffIndexManifest(
  previousManifest: IndexManifest | undefined,
  indexedChunks: IndexedChunk[],
  processedSourceNames: string[],
  embedding: EmbeddingSignature,
  chunking: ChunkConfig
): ManifestDiff {
  assertUniqueRecordIds(indexedChunks);

  const previousChunks = previousManifest?.chunks ?? {};
  const previousEmbeddingHash = previousManifest
    ? hashStableValue(previousManifest.embedding)
    : undefined;
  const previousChunkingHash = previousManifest
    ? hashStableValue(previousManifest.chunking)
    : undefined;
  const currentEmbeddingHash = hashStableValue(embedding);
  const currentChunkingHash = hashStableValue(chunking);
  const processedSources = new Set(processedSourceNames);
  const currentById = new Map(indexedChunks.map(chunk => [chunk.recordId, chunk]));

  const diff: ManifestDiff = {
    added: [],
    updated: [],
    unchanged: [],
    deleted: [],
  };

  for (const indexedChunk of indexedChunks) {
    const previousChunk = previousChunks[indexedChunk.recordId];

    if (!previousChunk) {
      diff.added.push(indexedChunk);
      continue;
    }

    const previousChunkEmbeddingHash = previousChunk.embeddingHash ?? previousEmbeddingHash;
    const previousChunkingConfigHash = previousChunk.chunkingHash ?? previousChunkingHash;

    if (
      previousChunk.hash !== indexedChunk.hash ||
      previousChunkEmbeddingHash !== currentEmbeddingHash ||
      previousChunkingConfigHash !== currentChunkingHash
    ) {
      diff.updated.push(indexedChunk);
    } else {
      diff.unchanged.push(indexedChunk);
    }
  }

  for (const [recordId, previousChunk] of Object.entries(previousChunks)) {
    if (processedSources.has(previousChunk.sourceName) && !currentById.has(recordId)) {
      diff.deleted.push({ recordId, ...previousChunk });
    }
  }

  return diff;
}

export function createIndexManifest(params: {
  previousManifest?: IndexManifest;
  indexedChunks: IndexedChunk[];
  processedSourceNames: string[];
  indexName: string;
  embedding: EmbeddingSignature;
  chunking: ChunkConfig;
}): IndexManifest {
  const processedSources = new Set(params.processedSourceNames);
  const chunks: Record<string, ManifestChunk> = {};

  for (const [recordId, previousChunk] of Object.entries(params.previousManifest?.chunks ?? {})) {
    if (!processedSources.has(previousChunk.sourceName)) {
      chunks[recordId] = previousChunk;
    }
  }

  for (const indexedChunk of params.indexedChunks) {
    chunks[indexedChunk.recordId] = toManifestChunk(indexedChunk);
  }

  return {
    version: INDEX_MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    indexName: params.indexName,
    embedding: params.embedding,
    chunking: params.chunking,
    chunks: sortRecord(chunks),
  };
}

export function computeChunkHash(chunk: DocChunk): string {
  return hashStableValue({
    embeddingInput: prepareChunkForEmbedding(chunk),
    metadata: buildChunkMetadata(chunk),
  });
}

export function hashStableValue(value: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function toManifestChunk(indexedChunk: IndexedChunk): ManifestChunk {
  return {
    rawId: indexedChunk.rawId,
    sourceName: indexedChunk.sourceName,
    hash: indexedChunk.hash,
    documentPath: indexedChunk.documentPath,
    heading: indexedChunk.heading,
    embeddingHash: indexedChunk.embeddingHash,
    chunkingHash: indexedChunk.chunkingHash,
  };
}

function normalizeManifest(manifest: Partial<IndexManifest>): IndexManifest {
  const embedding = manifest.embedding ?? { provider: 'unknown', model: 'unknown', dimensions: 0 };
  const chunking = manifest.chunking ?? { maxChunkSize: 0, minChunkSize: 0, idealChunkSize: 0 };
  const embeddingHash = hashStableValue(embedding);
  const chunkingHash = hashStableValue(chunking);
  const chunks: Record<string, ManifestChunk> = {};

  for (const [recordId, chunk] of Object.entries(manifest.chunks ?? {})) {
    chunks[recordId] = {
      rawId: chunk.rawId,
      sourceName: chunk.sourceName,
      hash: chunk.hash,
      documentPath: chunk.documentPath,
      heading: chunk.heading,
      embeddingHash: chunk.embeddingHash ?? embeddingHash,
      chunkingHash: chunk.chunkingHash ?? chunkingHash,
    };
  }

  return {
    version: INDEX_MANIFEST_VERSION,
    generatedAt: manifest.generatedAt ?? new Date(0).toISOString(),
    indexName: manifest.indexName ?? '',
    embedding,
    chunking,
    chunks: sortRecord(chunks),
  };
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}
