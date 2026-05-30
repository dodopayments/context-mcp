import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithRetry, HttpError, TimeoutError } from './http.js';

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

  // A fetch that honours the abort signal by rejecting with an AbortError,
  // exactly as the platform fetch does when our timeout fires.
  function abortableFetch(): typeof fetch {
    return vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    }) as unknown as typeof fetch;
  }

  it('retries a per-attempt timeout (translated to a retryable TimeoutError)', async () => {
    const fetchMock = abortableFetch();
    globalThis.fetch = fetchMock;

    await expect(
      fetchWithRetry('https://slow.example.com', {
        timeoutMs: 5,
        baseDelayMs: 1,
        maxAttempts: 3,
      })
    ).rejects.toBeInstanceOf(TimeoutError);

    // Proves the timeout was classified retryable: all attempts were used.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('eventually succeeds when a timeout is followed by a 200', async () => {
    let call = 0;
    globalThis.fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      call++;
      if (call === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
      return Promise.resolve(mockResponse(200, 'ok'));
    }) as unknown as typeof fetch;

    const res = await fetchWithRetry('https://example.com', {
      timeoutMs: 5,
      baseDelayMs: 1,
      maxAttempts: 3,
    });
    expect(res.status).toBe(200);
    expect(call).toBe(2);
  });
});
