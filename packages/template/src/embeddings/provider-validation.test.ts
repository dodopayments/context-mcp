import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateEmbeddingsCohere,
  generateEmbeddingsVoyage,
  reorderByIndex,
  assertEmbeddingCount,
} from './core.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('embedding count validation (regression)', () => {
  it('Cohere: throws when API returns fewer embeddings than inputs', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ embeddings: { float: [[1], [2]] } }));
    await expect(generateEmbeddingsCohere('k', 'embed-v4.0', ['a', 'b', 'c'], 1)).rejects.toThrow(
      /expected 3 embeddings but received 2/
    );
  });

  it('Voyage: throws when API returns fewer embeddings than inputs (indexed gap)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { embedding: [1], index: 0 },
          { embedding: [2], index: 1 },
        ],
      })
    );
    // 3 inputs, only indexes 0 and 1 returned -> slot 2 stays empty.
    await expect(generateEmbeddingsVoyage('k', 'voyage-3', ['a', 'b', 'c'], 1)).rejects.toThrow(
      /missing or empty/
    );
  });

  it('Voyage: throws when API returns fewer embeddings than inputs (no index)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [{ embedding: [1] }, { embedding: [2] }] }));
    await expect(generateEmbeddingsVoyage('k', 'voyage-3', ['a', 'b', 'c'], 1)).rejects.toThrow(
      /expected 3 embeddings but received 2/
    );
  });

  it('Cohere: throws on an empty embedding vector', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ embeddings: { float: [[]] } }));
    await expect(generateEmbeddingsCohere('k', 'embed-v4.0', ['a'], 1)).rejects.toThrow(
      /missing or empty/
    );
  });
});

describe('Voyage index reordering (regression)', () => {
  it('reassembles out-of-order responses into input order', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { embedding: [99], index: 1 },
          { embedding: [11], index: 0 },
        ],
      })
    );
    const out = await generateEmbeddingsVoyage('k', 'voyage-3', ['a', 'b'], 1);
    // text 'a' is index 0 -> must map to [11]; text 'b' index 1 -> [99]
    expect(out).toEqual([[11], [99]]);
  });

  it('reorderByIndex falls back to response order when no index present', () => {
    const out = reorderByIndex('T', [{ embedding: [1] }, { embedding: [2] }], 2);
    expect(out).toEqual([[1], [2]]);
  });

  it('reorderByIndex throws on out-of-range index', () => {
    expect(() => reorderByIndex('T', [{ embedding: [1], index: 5 }], 1)).toThrow(/out of range/);
  });

  it('assertEmbeddingCount passes for a matching, non-empty result', () => {
    expect(() => assertEmbeddingCount('T', [[1, 2]], 1)).not.toThrow();
  });
});
