import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateEmbeddingsCohere, generateEmbeddingsVoyage } from './core.js';

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

describe('generateEmbeddingsCohere', () => {
  it('posts to the Cohere embed endpoint with search_document input type', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ embeddings: { float: [[0.1, 0.2]] } }));
    globalThis.fetch = fetchMock;

    const out = await generateEmbeddingsCohere('key', 'embed-v4.0', ['hello'], 1024);
    expect(out).toEqual([[0.1, 0.2]]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.cohere.com/v2/embed');
    expect(init.headers.Authorization).toBe('Bearer key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('embed-v4.0');
    expect(body.input_type).toBe('search_document');
    expect(body.texts).toEqual(['hello']);
    // The configured dimension must be forwarded or the index upsert mismatches.
    expect(body.output_dimension).toBe(1024);
  });

  it('omits output_dimension when no dimension is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ embeddings: { float: [[0.1]] } }));
    globalThis.fetch = fetchMock;
    await generateEmbeddingsCohere('key', 'embed-v4.0', ['hello']);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('output_dimension');
  });

  it('throws on an unexpected response shape', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ wrong: true }));
    await expect(generateEmbeddingsCohere('key', 'embed-v4.0', ['x'])).rejects.toThrow(
      /unexpected response shape/
    );
  });
});

describe('generateEmbeddingsVoyage', () => {
  it('posts to the Voyage embeddings endpoint and maps data[].embedding', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ embedding: [1, 2, 3] }] }));
    globalThis.fetch = fetchMock;

    const out = await generateEmbeddingsVoyage('key', 'voyage-3', ['hello'], 1024);
    expect(out).toEqual([[1, 2, 3]]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.voyageai.com/v1/embeddings');
    const body = JSON.parse(init.body);
    expect(body.input_type).toBe('document');
    expect(body.model).toBe('voyage-3');
    // The configured dimension must be forwarded or the index upsert mismatches.
    expect(body.output_dimension).toBe(1024);
  });

  it('omits output_dimension when no dimension is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ embedding: [1] }] }));
    globalThis.fetch = fetchMock;
    await generateEmbeddingsVoyage('key', 'voyage-3', ['hello']);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('output_dimension');
  });

  it('throws on an unexpected response shape', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ nope: 1 }));
    await expect(generateEmbeddingsVoyage('key', 'voyage-3', ['x'])).rejects.toThrow(
      /unexpected response shape/
    );
  });
});
