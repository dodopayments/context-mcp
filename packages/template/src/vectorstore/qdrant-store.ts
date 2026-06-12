/**
 * Qdrant vector store adapter
 *
 * Implements the VectorStore interface against a Qdrant server via its REST
 * API (no SDK dependency). Works with both self-hosted Qdrant and Qdrant Cloud
 * (pass an apiKey for the latter).
 *
 * @see https://qdrant.tech/documentation/concepts/points/
 */

import { createHash } from 'node:crypto';
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
  /**
   * Optional namespace. Qdrant has no native namespaces, so we emulate them by
   * tagging each point's payload with `_namespace` and filtering reads/clears by
   * it — matching how PineconeStore scopes its namespace.
   */
  namespace?: string;
}

/**
 * Fixed UUIDv5 namespace for ContextMCP point ids (a random constant UUID).
 * Combined with the chunk id via SHA-1 to derive a collision-resistant,
 * deterministic point id.
 */
const POINT_ID_NAMESPACE = '6f9a6c1e-0d3b-5e4a-9b2c-7e8f1a2b3c4d';

/** Field used to emulate namespaces in the point payload. */
const NAMESPACE_FIELD = '_namespace';

// Qdrant distance names differ from the generic metric names.
const METRIC_TO_QDRANT: Record<NonNullable<EnsureIndexOptions['metric']>, string> = {
  cosine: 'Cosine',
  euclidean: 'Euclid',
  dotproduct: 'Dot',
};

/**
 * Convert an embedding record's id into a Qdrant-acceptable point id.
 *
 * Qdrant point ids must be an unsigned integer or a UUID; our ids are arbitrary
 * strings, so we derive a proper RFC 4122 **UUIDv5** (SHA-1 over a fixed
 * namespace + the full id). This uses the full 122 random bits of a UUID, so
 * birthday-collision odds are negligible even for very large corpora — unlike
 * the previous ~64-bit FNV pair whose two halves came from nearly identical
 * seeds. Deterministic, so re-indexing the same chunk overwrites its point.
 */
export function toQdrantPointId(id: string): string {
  // UUIDv5: SHA-1(namespace_bytes || name), then set version/variant bits.
  const nsBytes = Buffer.from(POINT_ID_NAMESPACE.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(nsBytes).update(Buffer.from(id, 'utf8')).digest();

  const bytes = hash.subarray(0, 16);
  // Version 5 (0101 in the high nibble of byte 6).
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  // RFC 4122 variant (10xx in the high bits of byte 8).
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
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
  private namespace: string;

  constructor(config: QdrantStoreConfig) {
    this.baseUrl = config.url.replace(/\/$/, '');
    this.collection = config.collection;
    this.apiKey = config.apiKey;
    this.namespace = config.namespace ?? '';
  }

  /**
   * A Qdrant filter scoping operations to the configured namespace, or
   * undefined when no namespace is set (operate on the whole collection).
   */
  private namespaceFilter(): Record<string, unknown> | undefined {
    if (!this.namespace) return undefined;
    return { must: [{ key: NAMESPACE_FIELD, match: { value: this.namespace } }] };
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
      // Scope the point id by namespace so the same chunk id in two namespaces
      // doesn't collide into one point (and overwrite the other).
      id: toQdrantPointId(this.namespace ? `${this.namespace}\u0000${r.id}` : r.id),
      vector: r.values,
      // Keep the original id and namespace alongside the metadata for
      // retrieval/debugging and namespace filtering.
      payload: {
        ...r.metadata,
        _id: r.id,
        ...(this.namespace ? { [NAMESPACE_FIELD]: this.namespace } : {}),
      },
    }));

    const res = await this.request('PUT', `/collections/${this.collection}/points?wait=true`, {
      points,
    });
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

      // Scope the delete to the namespace when set; otherwise an empty filter
      // matches all points in the collection.
      const res = await this.request(
        'POST',
        `/collections/${this.collection}/points/delete?wait=true`,
        { filter: this.namespaceFilter() ?? {} }
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
    const dimension = data.result?.config?.params?.vectors?.size;

    // Whole-collection count is in the collection info; a namespaced count needs
    // a filtered count query so we only report this namespace's vectors.
    const filter = this.namespaceFilter();
    if (!filter) {
      return { vectorCount: data.result?.points_count ?? 0, dimension };
    }

    const countRes = await this.request('POST', `/collections/${this.collection}/points/count`, {
      filter,
      exact: true,
    });
    if (!countRes.ok) {
      throw new Error(`Failed to count Qdrant points: ${countRes.status} ${await countRes.text()}`);
    }
    const countData = (await countRes.json()) as { result?: { count?: number } };
    return { vectorCount: countData.result?.count ?? 0, dimension };
  }
}
