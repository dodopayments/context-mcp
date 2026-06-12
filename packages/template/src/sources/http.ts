/**
 * HTTP utilities with timeout + retry
 *
 * Wraps fetch with a request timeout and the shared retry policy so source
 * fetchers don't fail permanently on transient network blips or 5xx responses.
 */

import { withRetry } from '../embeddings/core.js';

export interface FetchWithRetryOptions {
  /** Per-attempt timeout in ms (default 30s). */
  timeoutMs?: number;
  /** Max retry attempts (default 4). */
  maxAttempts?: number;
  /** Base backoff delay in ms (default 1s). */
  baseDelayMs?: number;
  /** Passed through to fetch. */
  init?: RequestInit;
}

/**
 * Error thrown for non-OK HTTP responses. Carries `status` and `headers` so the
 * shared retry policy can decide whether to retry and honour Retry-After.
 */
export class HttpError extends Error {
  status: number;
  headers: Headers;

  constructor(status: number, statusText: string, url: string, headers: Headers) {
    super(`Failed to fetch ${url}: ${status} ${statusText}`);
    this.name = 'HttpError';
    this.status = status;
    this.headers = headers;
  }
}

/**
 * Error thrown when a request exceeds its per-attempt timeout.
 *
 * A raw aborted fetch surfaces as a DOMException `AbortError` whose `.code` is
 * the numeric `20`, which the string-based network-code matcher in
 * `isRetryableError` can't recognise — so the attempt would never be retried.
 * We translate the timeout into this error with `code = 'ETIMEDOUT'` so the
 * shared retry policy treats it as the transient failure it is.
 */
export class TimeoutError extends Error {
  code = 'ETIMEDOUT';

  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Fetch a URL with a per-attempt timeout and automatic retries on transient
 * failures (429/408/5xx/network errors). Throws HttpError on a final non-OK
 * response, or the underlying error on a final network/timeout failure.
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const { timeoutMs = 30000, maxAttempts = 4, baseDelayMs = 1000, init } = options;

  return withRetry(
    async () => {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (!response.ok) {
          // Throw so withRetry can inspect status/headers and decide to retry.
          throw new HttpError(response.status, response.statusText, url, response.headers);
        }
        return response;
      } catch (err) {
        // A timeout-driven abort surfaces as an AbortError (numeric code 20),
        // which isn't recognised as retryable. Translate it so the retry
        // policy treats the timeout as the transient failure it is. Aborts we
        // didn't trigger (e.g. caller-supplied signal) are left untouched.
        if (timedOut && err instanceof Error && err.name === 'AbortError') {
          throw new TimeoutError(url, timeoutMs);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
    { maxAttempts, baseDelayMs, label: `GET ${url}` }
  );
}
