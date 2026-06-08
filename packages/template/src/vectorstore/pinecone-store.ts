/**
 * Pinecone vector store adapter
 *
 * Implements the VectorStore interface on top of the Pinecone serverless API.
 * Encapsulates the index lifecycle (create/wait), upsert, clear, and stats.
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { sleep } from '../embeddings/core.js';
import type {
  VectorStore,
  VectorStoreStats,
  EnsureIndexOptions,
  EmbeddingRecord,
} from './types.js';

export interface PineconeStoreConfig {
  apiKey: string;
  indexName: string;
  cloud?: 'aws' | 'gcp' | 'azure';
  region?: string;
  /** Optional namespace (defaults to the empty/default namespace). */
  namespace?: string;
}

export class PineconeStore implements VectorStore {
  readonly provider = 'pinecone';
  private pc: Pinecone;
  private indexName: string;
  private cloud: 'aws' | 'gcp' | 'azure';
  private region: string;
  private namespace: string;

  constructor(config: PineconeStoreConfig) {
    this.pc = new Pinecone({ apiKey: config.apiKey });
    this.indexName = config.indexName;
    this.cloud = config.cloud ?? 'aws';
    this.region = config.region ?? 'us-east-1';
    this.namespace = config.namespace ?? '';
  }

  private index() {
    return this.pc.index(this.indexName);
  }

  async ensureIndex(options: EnsureIndexOptions): Promise<void> {
    const indexes = await this.pc.listIndexes();
    const exists = indexes.indexes?.some(i => i.name === this.indexName);

    if (exists) {
      console.log(`✅ Using existing index: ${this.indexName}`);
      return;
    }

    console.log(`📦 Creating Pinecone index: ${this.indexName}`);
    await this.pc.createIndex({
      name: this.indexName,
      dimension: options.dimension,
      metric: options.metric ?? 'cosine',
      spec: { serverless: { cloud: this.cloud, region: this.region } },
    });

    console.log('⏳ Waiting for index to be ready...');
    let ready = false;
    while (!ready) {
      const description = await this.pc.describeIndex(this.indexName);
      ready = description.status?.ready ?? false;
      if (!ready) {
        await sleep(2000);
        process.stdout.write('.');
      }
    }
    console.log('\n✅ Index ready!');
  }

  async upsert(records: EmbeddingRecord[]): Promise<void> {
    if (records.length === 0) return;
    const index = this.namespace ? this.index().namespace(this.namespace) : this.index();
    await index.upsert(records);
  }

  /**
   * Delete all vectors in the configured namespace.
   *
   * Behavior note: this scopes the delete to `this.namespace` (the empty/default
   * namespace when none is configured). If you set `vectordb.namespace`, clear
   * only removes that namespace's vectors — not the entire index. (The reported
   * count comes from index-wide stats, so with a non-default namespace the
   * "found N vectors" log may exceed what's actually deleted.)
   */
  async clear(): Promise<{ success: boolean; vectorCount?: number }> {
    try {
      const index = this.index();
      const stats = await index.describeIndexStats();
      const vectorCount = stats.totalRecordCount || 0;

      if (vectorCount === 0) {
        console.log('   Index is already empty');
        return { success: true, vectorCount: 0 };
      }

      console.log(`   Found ${vectorCount.toLocaleString()} vectors to delete...`);
      await index.namespace(this.namespace).deleteAll();
      await sleep(2000);

      const newStats = await index.describeIndexStats();
      const remaining = newStats.totalRecordCount || 0;
      if (remaining > 0) {
        console.log(`   ⚠️ ${remaining} vectors still remaining (may take time to propagate)`);
      }

      return { success: true, vectorCount };
    } catch (error) {
      console.error('   Error clearing index:', error);
      return { success: false };
    }
  }

  async stats(): Promise<VectorStoreStats> {
    const stats = await this.index().describeIndexStats();
    return {
      // Scope the count to the configured namespace so this matches
      // QdrantStore.stats(), which reports only the namespace's vectors. The
      // SDK exposes per-namespace counts under `namespaces[name].recordCount`;
      // fall back to the whole-index total only when that map is absent.
      vectorCount: this.namespacedVectorCount(stats),
      dimension: stats.dimension,
    };
  }

  /**
   * Resolve the vector count for `this.namespace` from a describeIndexStats
   * response. The Pinecone SDK reports counts per namespace; using the
   * whole-index `totalRecordCount` would over-report whenever other namespaces
   * share the index (and break parity with QdrantStore).
   */
  private namespacedVectorCount(stats: {
    totalRecordCount?: number;
    namespaces?: Record<string, { recordCount?: number } | undefined>;
  }): number {
    const summary = stats.namespaces?.[this.namespace];
    if (summary && typeof summary.recordCount === 'number') {
      return summary.recordCount;
    }
    // No per-namespace entry: an unconfigured/empty namespace with no vectors,
    // or an SDK response without the namespaces map. When a specific namespace
    // is configured but missing from the map, it holds zero vectors.
    if (stats.namespaces && this.namespace) {
      return 0;
    }
    return stats.totalRecordCount || 0;
  }
}
