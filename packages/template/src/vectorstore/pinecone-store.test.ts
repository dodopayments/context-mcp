import { describe, it, expect } from 'vitest';
import { PineconeStore } from './pinecone-store.js';

/**
 * Build a PineconeStore wired to a fake Pinecone client so we can assert the
 * adapter's mapping logic without hitting the network. The fake index mirrors
 * the real SDK's `describeIndexStats()` shape, which reports per-namespace
 * record counts under `namespaces[name].recordCount` alongside a whole-index
 * `totalRecordCount`.
 */
function storeWithStats(
  namespace: string | undefined,
  stats: {
    totalRecordCount?: number;
    dimension?: number;
    namespaces?: Record<string, { recordCount: number }>;
  }
) {
  const store = new PineconeStore({ apiKey: 'x', indexName: 'docs', namespace });
  const fakeIndex = {
    describeIndexStats: async () => stats,
    namespace: () => ({ deleteAll: async () => {} }),
    upsert: async () => {},
  };
  // Inject the fake client.
  (store as unknown as { pc: { index: () => typeof fakeIndex } }).pc = {
    index: () => fakeIndex,
  };
  return store;
}

describe('PineconeStore.stats namespace parity', () => {
  it('reports only the configured namespace count (parity with Qdrant)', async () => {
    const store = storeWithStats('team-a', {
      totalRecordCount: 1000, // whole index across ALL namespaces
      dimension: 3072,
      namespaces: {
        '': { recordCount: 700 },
        'team-a': { recordCount: 300 }, // our namespace only
      },
    });
    const s = await store.stats();
    // QdrantStore.stats() returns the namespace-scoped count; PineconeStore
    // must do the same, not leak the whole-index total.
    expect(s.vectorCount).toBe(300);
    expect(s.dimension).toBe(3072);
  });

  it('reports the default namespace count when no namespace configured', async () => {
    const store = storeWithStats('', {
      totalRecordCount: 1000,
      dimension: 3072,
      namespaces: {
        '': { recordCount: 700 },
        'team-a': { recordCount: 300 },
      },
    });
    const s = await store.stats();
    expect(s.vectorCount).toBe(700);
  });

  it('falls back to totalRecordCount when the namespaces map is absent', async () => {
    const store = storeWithStats(undefined, {
      totalRecordCount: 42,
      dimension: 1536,
    });
    const s = await store.stats();
    expect(s.vectorCount).toBe(42);
    expect(s.dimension).toBe(1536);
  });
});
