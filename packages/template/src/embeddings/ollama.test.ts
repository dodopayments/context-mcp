import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateEmbeddingsOllama } from './core.js';

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

describe('generateEmbeddingsOllama', () => {
  it('posts to {baseUrl}/api/embed and returns embeddings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ embeddings: [[0.5, 0.6]] }));
    globalThis.fetch = fetchMock;

    const out = await generateEmbeddingsOllama('http://localhost:11434', 'nomic-embed-text', [
      'hello',
    ]);
    expect(out).toEqual([[0.5, 0.6]]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/embed');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('nomic-embed-text');
    expect(body.input).toEqual(['hello']);
  });

  it('strips a trailing slash from the base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ embeddings: [[1]] }));
    globalThis.fetch = fetchMock;

    await generateEmbeddingsOllama('http://localhost:11434/', 'm', ['x']);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/embed');
  });

  it('throws on an unexpected response shape', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ nope: true }));
    await expect(generateEmbeddingsOllama('http://localhost:11434', 'm', ['x'])).rejects.toThrow(
      /unexpected response shape/
    );
  });
});
