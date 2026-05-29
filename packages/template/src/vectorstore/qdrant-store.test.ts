import { describe, it, expect, vi, afterEach } from 'vitest';
import { QdrantStore, toQdrantPointId } from './qdrant-store.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('toQdrantPointId', () => {
  it('produces a UUID-shaped id', () => {
    const id = toQdrantPointId('docs/intro#section');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('is deterministic for the same input', () => {
    expect(toQdrantPointId('same')).toBe(toQdrantPointId('same'));
  });

  it('differs for different inputs', () => {
    expect(toQdrantPointId('a')).not.toBe(toQdrantPointId('b'));
  });
});

describe('QdrantStore', () => {
  const config = { url: 'http://localhost:6333', collection: 'docs' };

  it('reports its provider name', () => {
    expect(new QdrantStore(config).provider).toBe('qdrant');
  });

  it('ensureIndex is a no-op when the collection already exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    globalThis.fetch = fetchMock;

    await new QdrantStore(config).ensureIndex({ dimension: 1536 });
    // Only the existence GET, no PUT to create.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  });

  it('ensureIndex creates the collection with the right size/distance when missing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    globalThis.fetch = fetchMock;

    await new QdrantStore(config).ensureIndex({ dimension: 1536, metric: 'cosine' });

    const createCall = fetchMock.mock.calls[1];
    expect(createCall[1].method).toBe('PUT');
    const body = JSON.parse(createCall[1].body);
    expect(body.vectors.size).toBe(1536);
    expect(body.vectors.distance).toBe('Cosine');
  });

  it('upsert sends points with vector + payload (original id preserved)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    globalThis.fetch = fetchMock;

    await new QdrantStore(config).upsert([
      {
        id: 'chunk-1',
        values: [0.1, 0.2],
        metadata: {
          documentPath: 'a.md',
          documentTitle: 'A',
          category: 'docs',
          heading: 'H',
          content: 'text',
        },
      },
    ]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.points).toHaveLength(1);
    expect(body.points[0].vector).toEqual([0.1, 0.2]);
    expect(body.points[0].payload._id).toBe('chunk-1');
    expect(body.points[0].id).toBe(toQdrantPointId('chunk-1'));
  });

  it('upsert is a no-op for an empty batch', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    await new QdrantStore(config).upsert([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stats reads points_count and vector size', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ result: { points_count: 42, config: { params: { vectors: { size: 768 } } } } }),
        { status: 200 }
      )
    );
    const stats = await new QdrantStore(config).stats();
    expect(stats.vectorCount).toBe(42);
    expect(stats.dimension).toBe(768);
  });

  it('sends the api-key header when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    globalThis.fetch = fetchMock;
    await new QdrantStore({ ...config, apiKey: 'secret' }).ensureIndex({ dimension: 10 });
    expect(fetchMock.mock.calls[0][1].headers['api-key']).toBe('secret');
  });
});
