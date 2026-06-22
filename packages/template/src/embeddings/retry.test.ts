import { describe, it, expect, vi } from 'vitest';
import { isRetryableError, isRetryableUpsertError, withRetry, retryAfterMs } from './core.js';

describe('isRetryableError', () => {
  it('retries on rate limit (429) and request timeout (408)', () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 408 })).toBe(true);
  });

  it('retries on 5xx server errors', () => {
    expect(isRetryableError({ status: 500 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ statusCode: 502 })).toBe(true);
    expect(isRetryableError({ response: { status: 504 } })).toBe(true);
  });

  it('does NOT retry on 4xx client errors (except 408/429)', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 401 })).toBe(false);
    expect(isRetryableError({ status: 404 })).toBe(false);
  });

  it('retries on transient network error codes', () => {
    expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isRetryableError({ code: 'EAI_AGAIN' })).toBe(true);
  });

  it('does NOT retry a hard NXDOMAIN (ENOTFOUND) — it is permanent', () => {
    expect(isRetryableError({ code: 'ENOTFOUND' })).toBe(false);
  });

  it('retries a timeout/abort recognised by error name', () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    expect(isRetryableError(aborted)).toBe(true);

    const timedOut = new Error('timed out');
    timedOut.name = 'TimeoutError';
    expect(isRetryableError(timedOut)).toBe(true);
  });

  it('reads the network code from a nested cause (fetch errors)', () => {
    expect(isRetryableError({ cause: { code: 'ECONNRESET' } })).toBe(true);
  });

  it('does NOT retry on a generic error with no status or code', () => {
    expect(isRetryableError(new Error('boom'))).toBe(false);
    expect(isRetryableError({ code: 'EACCES' })).toBe(false);
  });

  it('does NOT retry a Pinecone connection error (no status/code exposed)', () => {
    // The Pinecone SDK's PineconeConnectionError exposes neither .status nor a
    // top-level .code (the real network code is nested several causes deep), so
    // the generic predicate cannot recognise it — that is why upsert needs
    // isRetryableUpsertError. See experiment in PR #43.
    const connErr = new Error('Request failed to reach Pinecone');
    connErr.name = 'PineconeConnectionError';
    expect(isRetryableError(connErr)).toBe(false);
  });
});

describe('isRetryableUpsertError', () => {
  it('retries a Pinecone connection error the SDK does not retry', () => {
    // Matched by name: the SDK does not export the class, and its own docs use
    // e.name === 'PineconeConnectionError' as the public discriminator.
    const connErr = new Error('Request failed to reach Pinecone');
    connErr.name = 'PineconeConnectionError';
    expect(isRetryableUpsertError(connErr)).toBe(true);
  });

  it('does NOT retry a Pinecone client error (4xx)', () => {
    const badRequest = new Error('bad request');
    badRequest.name = 'PineconeBadRequestError';
    expect(isRetryableUpsertError(badRequest)).toBe(false);
  });

  it('still delegates to isRetryableError for raw network/status errors', () => {
    expect(isRetryableUpsertError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableUpsertError({ status: 503 })).toBe(true);
    expect(isRetryableUpsertError({ status: 400 })).toBe(false);
  });

  it('drives withRetry to retry a connection-failed upsert then succeed', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) {
          const e = new Error('Request failed to reach Pinecone');
          e.name = 'PineconeConnectionError';
          throw e;
        }
        return 'upserted';
      },
      { shouldRetry: isRetryableUpsertError, maxAttempts: 3, baseDelayMs: 1 }
    );
    expect(result).toBe('upserted');
    expect(calls).toBe(2);
  });
});

describe('withRetry', () => {
  it('returns immediately on success without retrying', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries a retryable error then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw { status: 503 };
        return 'recovered';
      },
      { maxAttempts: 5, baseDelayMs: 1 }
    );
    expect(result).toBe('recovered');
    expect(calls).toBe(3);
  });

  it('throws immediately on a non-retryable error (no wasted attempts)', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw { status: 400 };
        },
        { maxAttempts: 5, baseDelayMs: 1 }
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1);
  });

  it('gives up after maxAttempts and rethrows the last error', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw { status: 500 };
        },
        { maxAttempts: 3, baseDelayMs: 1 }
      )
    ).rejects.toMatchObject({ status: 500 });
    expect(calls).toBe(3);
  });

  it('supports the legacy positional signature withRetry(fn, maxAttempts, baseDelayMs)', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw { status: 503 };
        },
        2,
        1
      )
    ).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(2);
  });

  it('makes exactly one attempt when maxAttempts is non-positive/non-finite (does not throw a bogus exhausted error)', async () => {
    // Adversarial config: 0, negative, or NaN (e.g. an unparsed env var) must
    // never short-circuit the loop and throw without ever running the op.
    for (const maxAttempts of [0, -1, NaN]) {
      let calls = 0;
      const result = await withRetry(
        async () => {
          calls++;
          return 'ok';
        },
        { maxAttempts, baseDelayMs: 1 }
      );
      expect(result).toBe('ok');
      expect(calls).toBe(1);
    }
  });

  it('clamps an absurd Retry-After to maxDelayMs (does not hang for hours)', async () => {
    // A server can legally send Retry-After: 86400 (24h). The retry must be
    // capped so a hostile/buggy server cannot stall the whole run.
    const realSetTimeout = globalThis.setTimeout;
    let capturedDelay: number | null = null;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: () => void,
      ms?: number,
      ...rest: unknown[]
    ) => {
      if (capturedDelay === null && (ms ?? 0) > 1000) {
        capturedDelay = ms ?? 0;
        // Fire immediately so the test doesn't actually wait.
        return realSetTimeout(fn, 0, ...(rest as []));
      }
      return realSetTimeout(fn, ms, ...(rest as []));
    }) as unknown as typeof setTimeout);

    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) throw { status: 429, headers: { 'retry-after': '86400' } };
        return 'ok';
      },
      { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 60000 }
    );
    spy.mockRestore();

    expect(result).toBe('ok');
    expect(capturedDelay).not.toBeNull();
    // 86400s (=86_400_000ms) requested by the server, but clamped to maxDelayMs.
    expect(capturedDelay!).toBeLessThanOrEqual(60000);
  });

  it('honours a custom shouldRetry predicate', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error('custom');
        },
        { maxAttempts: 3, baseDelayMs: 1, shouldRetry: () => false }
      )
    ).rejects.toThrow('custom');
    expect(calls).toBe(1);
  });

  it('uses a server-supplied Retry-After delay instead of the exponential backoff', async () => {
    // baseDelayMs is huge (10s); the server says retry in 30ms. If the
    // Retry-After header is honoured the call resolves quickly, proving the
    // header overrides the configured backoff rather than being ignored.
    let calls = 0;
    const start = Date.now();
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) throw { status: 429, headers: { 'retry-after': '0' } };
        return 'ok';
      },
      { maxAttempts: 3, baseDelayMs: 10000 }
    );
    const elapsed = Date.now() - start;
    expect(result).toBe('ok');
    expect(calls).toBe(2);
    // Would be ~10s if the backoff were used; Retry-After: 0 makes it near-instant.
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('retryAfterMs', () => {
  it('parses delta-seconds into milliseconds', () => {
    expect(retryAfterMs({ headers: { 'retry-after': '2' } })).toBe(2000);
    expect(retryAfterMs({ headers: { 'retry-after': '0' } })).toBe(0);
  });

  it('reads from a Headers instance', () => {
    const headers = new Headers({ 'retry-after': '3' });
    expect(retryAfterMs({ headers })).toBe(3000);
  });

  it('parses an HTTP-date into a forward-looking delay', () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const ms = retryAfterMs({ headers: { 'retry-after': future } });
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(5000);
  });

  it('returns undefined for whitespace-only or junk values (not a bogus 0)', () => {
    expect(retryAfterMs({ headers: { 'retry-after': '   ' } })).toBeUndefined();
    expect(retryAfterMs({ headers: { 'retry-after': 'soon' } })).toBeUndefined();
  });

  it('returns undefined when no header is present', () => {
    expect(retryAfterMs({})).toBeUndefined();
    expect(retryAfterMs(new Error('x'))).toBeUndefined();
  });
});
