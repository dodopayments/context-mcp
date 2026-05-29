/**
 * Qdrant vector store adapter
 *
 * Implements the VectorStore interface against a Qdrant server via its REST
 * API (no SDK dependency). Works with both self-hosted Qdrant and Qdrant Cloud
 * (pass an apiKey for the latter).
 *
 * @see https://qdrant.tech/documentation/concepts/points/
 */

import type {
  VectorStore,
  VectorStoreStats,
  EnsureIndexOptions,
  EmbeddingRecord,
} from './types.js';

export interface QdrantStoreConfig {
  /** Base URL, e.g. http://localhost:6333 or https://xyz.qdrant.io */
  url: string;
  /** Collection name (analogous to a Pinecone index). */
  collection: string;
  /** API key for Qdrant Cloud (optional for local). */
  apiKey?: string;
}

// Qdrant distance names differ from the generic metric names.
const METRIC_TO_QDRANT: Record<NonNullable<EnsureIndexOptions['metric']>, string> = {
  cosine: 'Cosine',
  euclidean: 'Euclid',
  dotproduct: 'Dot',
};

/**
 * Convert an embedding record's id into a Qdrant-acceptable point id.
 * Qdrant point ids must be an unsigned integer or a UUID; our ids are arbitrary
 * strings, so we deterministically derive a UUIDv5-like id from the string and
 * keep the original id in the payload for retrieval.
 */
export function toQdrantPointId(id: string): string {
  // FNV-1a 128-bit-ish hash spread across 32 hex chars, formatted as a UUID.
  // Deterministic so re-indexing the same chunk overwrites its point.
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + 0x9e), 0x01000193) >>> 0;
  }
  const hex = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).padEnd(32, '0');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  );
}

export class QdrantStore implements VectorStore {
  readonly provider = 'qdrant';
  private baseUrl: string;
  private collection: string;
  private apiKey?: string;

  constructor(config: QdrantStoreConfig) {
    this.baseUrl = config.url.replace(/\/$/, '');
    this.collection = config.collection;
    this.apiKey = config.apiKey;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['api-key'] = this.apiKey;
    return h;
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async ensureIndex(options: EnsureIndexOptions): Promise<void> {
    // Exists?
    const existing = await this.request('GET', `/collections/${this.collection}`);
    if (existing.ok) {
      console.log(`✅ Using existing collection: ${this.collection}`);
      return;
    }

    console.log(`📦 Creating Qdrant collection: ${this.collection}`);
    const res = await this.request('PUT', `/collections/${this.collection}`, {
      vectors: {
        size: options.dimension,
        distance: METRIC_TO_QDRANT[options.metric ?? 'cosine'],
      },
    });
    if (!res.ok) {
      throw new Error(
        `Failed to create Qdrant collection ${this.collection}: ${res.status} ${await res.text()}`
      );
    }
    console.log('✅ Collection ready!');
  }

  async upsert(records: EmbeddingRecord[]): Promise<void> {
    if (records.length === 0) return;
    const points = records.map(r => ({
      id: toQdrantPointId(r.id),
      vector: r.values,
      // Keep the original id alongside the metadata for retrieval/debugging.
      payload: { ...r.metadata, _id: r.id },
    }));

    const res = await this.request(
      'PUT',
      `/collections/${this.collection}/points?wait=true`,
      { points }
    );
    if (!res.ok) {
      throw new Error(`Qdrant upsert failed: ${res.status} ${await res.text()}`);
    }
  }

  async clear(): Promise<{ success: boolean; vectorCount?: number }> {
    try {
      const before = await this.stats();
      if (before.vectorCount === 0) {
        console.log('   Collection is already empty');
        return { success: true, vectorCount: 0 };
      }
      console.log(`   Found ${before.vectorCount.toLocaleString()} vectors to delete...`);

      // Delete all points by an always-true filter (empty filter matches all).
      const res = await this.request(
        'POST',
        `/collections/${this.collection}/points/delete?wait=true`,
        { filter: {} }
      );
      if (!res.ok) {
        console.error(`   Error clearing collection: ${res.status} ${await res.text()}`);
        return { success: false };
      }
      return { success: true, vectorCount: before.vectorCount };
    } catch (error) {
      console.error('   Error clearing collection:', error);
      return { success: false };
    }
  }

  async stats(): Promise<VectorStoreStats> {
    const res = await this.request('GET', `/collections/${this.collection}`);
    if (!res.ok) {
      throw new Error(`Failed to read Qdrant stats: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      result?: { points_count?: number; config?: { params?: { vectors?: { size?: number } } } };
    };
    return {
      vectorCount: data.result?.points_count ?? 0,
      dimension: data.result?.config?.params?.vectors?.size,
    };
  }
}
