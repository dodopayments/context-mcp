import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithRetry, HttpError } from './http.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function mockResponse(status: number, body = ''): Response {
  return new Response(body, { status });
}

describe('fetchWithRetry', () => {
  it('returns the response on a 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, 'hello'));
    const res = await fetchWithRetry('https://example.com');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello');
  });

  it('retries a 503 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(503))
      .mockResolvedValueOnce(mockResponse(200, 'ok'));
    globalThis.fetch = fetchMock;

    const res = await fetchWithRetry('https://example.com', { baseDelayMs: 1, maxAttempts: 3 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws an HttpError after exhausting retries on a persistent 500', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(500));
    await expect(
      fetchWithRetry('https://example.com', { baseDelayMs: 1, maxAttempts: 2 })
    ).rejects.toBeInstanceOf(HttpError);
  });

  it('does not retry a 404 and throws HttpError immediately', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(404));
    globalThis.fetch = fetchMock;
    await expect(
      fetchWithRetry('https://example.com', { baseDelayMs: 1, maxAttempts: 3 })
    ).rejects.toBeInstanceOf(HttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
