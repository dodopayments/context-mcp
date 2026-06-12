import { describe, it, expect } from 'vitest';
import { isRetryableError, withRetry, retryAfterMs } from './core.js';

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
