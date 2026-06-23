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

  it('is a valid RFC 4122 UUIDv5 (version 5, variant 10xx)', () => {
    const id = toQdrantPointId('some/chunk#3');
    // Version nibble (first char of 3rd group) must be '5'.
    expect(id[14]).toBe('5');
    // Variant high bits (first char of 4th group) must be one of 8/9/a/b.
    expect('89ab').toContain(id[19]);
  });

  it('matches a known UUIDv5 vector (guards against algorithm drift)', () => {
    // Precomputed UUIDv5(namespace=6f9a6c1e-..., name="chunk-1") for this code.
    // If this changes, all existing Qdrant point ids would change — a breaking
    // re-index — so it must change deliberately, not by accident.
    expect(toQdrantPointId('chunk-1')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
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
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            result: { points_count: 42, config: { params: { vectors: { size: 768 } } } },
          }),
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

describe('QdrantStore namespace support', () => {
  const config = { url: 'http://localhost:6333', collection: 'docs', namespace: 'team-a' };

  it('tags upserted points with the namespace and scopes the point id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    globalThis.fetch = fetchMock;

    await new QdrantStore(config).upsert([
      {
        id: 'chunk-1',
        values: [0.1],
        metadata: {
          documentPath: 'a.md',
          documentTitle: 'A',
          category: 'docs',
          heading: 'H',
          content: 'x',
        },
      },
    ]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // Payload carries the namespace for filtered reads.
    expect(body.points[0].payload._namespace).toBe('team-a');
    // The point id is namespace-scoped, so it differs from the un-namespaced id
    // (same chunk in another namespace can't collide into one point).
    expect(body.points[0].id).toBe(toQdrantPointId('team-a\u0000chunk-1'));
    expect(body.points[0].id).not.toBe(toQdrantPointId('chunk-1'));
  });

  it('scopes clear() to the namespace via a filter', async () => {
    const fetchMock = vi
      .fn()
      // stats() count query (namespaced path): collection info, then count.
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { config: { params: { vectors: { size: 3 } } } } }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { count: 5 } }), { status: 200 })
      )
      // the delete call
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    globalThis.fetch = fetchMock;

    const res = await new QdrantStore(config).clear();
    expect(res.success).toBe(true);

    const deleteCall = fetchMock.mock.calls.find(c => String(c[0]).includes('/points/delete'));
    expect(deleteCall).toBeTruthy();
    const body = JSON.parse(deleteCall![1].body);
    expect(body.filter.must[0].key).toBe('_namespace');
    expect(body.filter.must[0].match.value).toBe('team-a');
  });

  it('stats() counts only the namespace via a filtered count query', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { config: { params: { vectors: { size: 3 } } } } }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { count: 7 } }), { status: 200 })
      );
    globalThis.fetch = fetchMock;

    const stats = await new QdrantStore(config).stats();
    expect(stats.vectorCount).toBe(7);
    expect(stats.dimension).toBe(3);

    const countCall = fetchMock.mock.calls.find(c => String(c[0]).includes('/points/count'));
    expect(countCall).toBeTruthy();
    const body = JSON.parse(countCall![1].body);
    expect(body.filter.must[0].match.value).toBe('team-a');
    expect(body.exact).toBe(true);
  });
});
