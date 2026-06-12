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
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (!response.ok) {
          // Throw so withRetry can inspect status/headers and decide to retry.
          throw new HttpError(response.status, response.statusText, url, response.headers);
        }
        return response;
      } finally {
        clearTimeout(timer);
      }
    },
    { maxAttempts, baseDelayMs, label: `GET ${url}` }
  );
}
