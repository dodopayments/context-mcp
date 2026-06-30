import { describe, it, expect, vi } from 'vitest';
import {
  isRetryableError,
  isRetryableUpsertError,
  isRetryableGitError,
  withRetry,
  retryAfterMs,
} from './core.js';

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

// Build a realistic execFileSync failure: a non-zero exit status plus a Buffer
// stderr, exactly as Node attaches when `execFileSync('git', …)` throws.
function gitExecError(stderr: string, status = 128): Error {
  const e = new Error(`Command failed: git clone 'https://github.com/owner/repo.git'`);
  (e as { status?: number; stderr?: Buffer }).status = status;
  (e as { stderr?: Buffer }).stderr = Buffer.from(stderr, 'utf8');
  return e;
}

describe('isRetryableGitError', () => {
  it('retries an RPC failure (mid-transfer network drop)', () => {
    expect(isRetryableGitError(gitExecError('fatal: RPC failed; curl 56 GnuTLS recv error'))).toBe(
      true
    );
  });

  it('retries an early EOF (server closed the object stream early)', () => {
    expect(isRetryableGitError(gitExecError('fatal: early EOF'))).toBe(true);
  });

  it('retries an unexpected disconnect (fetch-pack)', () => {
    expect(isRetryableGitError(gitExecError('fetch-pack: unexpected disconnect'))).toBe(true);
  });

  it('retries a remote-end-hung-up (peer dropped the connection)', () => {
    expect(isRetryableGitError(gitExecError('fatal: the remote end hung up unexpectedly'))).toBe(
      true
    );
  });

  it('retries a connection reset by peer (TCP RST)', () => {
    expect(
      isRetryableGitError(gitExecError("fatal: unable to access '...': Connection reset by peer"))
    ).toBe(true);
  });

  it('retries a connection timed out (TCP timeout)', () => {
    expect(
      isRetryableGitError(gitExecError("fatal: unable to access '...': Connection timed out"))
    ).toBe(true);
  });

  it('retries a connection refused / failed to connect (transient during restarts)', () => {
    expect(
      isRetryableGitError(
        gitExecError("fatal: unable to access '...': Failed to connect to github.com port 443: Connection refused")
      )
    ).toBe(true);
  });

  it('retries a TLS read blip (OpenSSL ssl_read)', () => {
    expect(isRetryableGitError(gitExecError('fatal: SSL_read: ... GnuTLS'))).toBe(true);
  });

  it('retries a GnuTLS error (common on Linux CI)', () => {
    expect(
      isRetryableGitError(
        gitExecError('GnuTLS recv error (-110): The TLS connection was non-properly terminated')
      )
    ).toBe(true);
  });

  it('retries an empty reply from server', () => {
    expect(
      isRetryableGitError(gitExecError("fatal: unable to access '...': Empty reply from server"))
    ).toBe(true);
  });

  it('retries a transfer closed with outstanding read data (curl 18)', () => {
    expect(
      isRetryableGitError(
        gitExecError('error: RPC failed; curl 18 transfer closed with outstanding read data remaining')
      )
    ).toBe(true);
  });

  it('retries a premature end of pack file (truncated transfer)', () => {
    expect(isRetryableGitError(gitExecError('fatal: premature end of pack file'))).toBe(true);
  });

  it('retries an invalid index-pack output (consequence of truncated transfer)', () => {
    expect(isRetryableGitError(gitExecError('fatal: fetch-pack: invalid index-pack output'))).toBe(
      true
    );
  });

  it('retries a broken pipe (write to closed socket)', () => {
    expect(isRetryableGitError(gitExecError('Write failed: Broken pipe'))).toBe(true);
  });

  it('retries an HTTP/2 stream not closed cleanly (curl 92)', () => {
    expect(
      isRetryableGitError(
        gitExecError('RPC failed; curl 92 HTTP/2 stream 0 was not closed cleanly: INTERNAL_ERROR (err 2)')
      )
    ).toBe(true);
  });

  it('retries a protocol error: bad pack header', () => {
    expect(isRetryableGitError(gitExecError('protocol error: bad pack header'))).toBe(true);
  });

  it('retries an expected flush after ref listing', () => {
    expect(
      isRetryableGitError(gitExecError('fatal: expected flush after ref listing'))
    ).toBe(true);
  });

  it('retries an HTTP 5xx from the git smart-HTTP transport', () => {
    expect(
      isRetryableGitError(gitExecError('fatal: unable to access the requested URL returned error: 503'))
    ).toBe(true);
  });

  it('retries a connection closed by remote host (SSH)', () => {
    expect(
      isRetryableGitError(gitExecError('Connection closed by remote host'))
    ).toBe(true);
  });

  it('retries a could-not-connect-to-server (connect timeout)', () => {
    expect(
      isRetryableGitError(
        gitExecError('Failed to connect to github.com port 443: Couldn\'t connect to server')
      )
    ).toBe(true);
  });

  it('retries a network is unreachable (ENETUNREACH)', () => {
    expect(
      isRetryableGitError(gitExecError('fatal: unable to access: Network is unreachable'))
    ).toBe(true);
  });

  it('retries a TLS packet with unexpected length', () => {
    expect(
      isRetryableGitError(gitExecError('TLS packet with unexpected length was received'))
    ).toBe(true);
  });

  it('reads stderr from a Buffer (execFileSync shape), not just a string', () => {
    // Proves Buffer -> utf8 decoding. If the predicate only handled strings it
    // would silently never match a real execFileSync error.
    const e = gitExecError('fatal: RPC failed');
    expect((e as { stderr?: Buffer }).stderr).toBeInstanceOf(Buffer);
    expect(isRetryableGitError(e)).toBe(true);
  });

  it('does NOT retry when stderr is an empty Buffer (git failed silently - no pattern to match)', () => {
    const e = gitExecError('', 128);
    expect((e as { stderr?: Buffer }).stderr).toBeInstanceOf(Buffer);
    expect((e as { stderr?: Buffer }).stderr!.length).toBe(0);
    expect(isRetryableGitError(e)).toBe(false);
  });

  it('falls back to err.message when stderr is absent but message carries a pattern', () => {
    const e = new Error('git clone failed: Connection timed out');
    expect(isRetryableGitError(e)).toBe(true);
  });

  it('does NOT retry "Repository not found" (wrong URL / no access — permanent)', () => {
    expect(isRetryableGitError(gitExecError('fatal: Repository not found'))).toBe(false);
  });

  it('does NOT retry an authentication failure (bad token — permanent)', () => {
    expect(isRetryableGitError(gitExecError('fatal: Authentication failed for ...'))).toBe(false);
  });

  it('does NOT retry a permission denied (SSH/auth — permanent)', () => {
    expect(isRetryableGitError(gitExecError('Permission denied (publickey)'))).toBe(false);
  });

  it('does NOT retry "Remote branch X not found" — critical so the default-branch fallback still runs', () => {
    // If this were retryable, withRetry would burn all attempts on the missing
    // branch and the outer catch in cloneRepository could never reach the
    // default-branch clone. It MUST be non-retryable.
    expect(isRetryableGitError(gitExecError('fatal: Remote branch nonexistent-branch not found'))).toBe(
      false
    );
  });

  it('does NOT retry a missing-username prompt (no token for a private repo)', () => {
    expect(isRetryableGitError(gitExecError("fatal: could not read Username '...'"))).toBe(false);
  });

  it('does NOT retry "not a git repository" (local path issue — permanent)', () => {
    expect(isRetryableGitError(gitExecError('fatal: not a git repository: ...'))).toBe(false);
  });

  it('does NOT retry a generic error with no stderr/status/code (allowlist default-deny)', () => {
    expect(isRetryableGitError(new Error('boom'))).toBe(false);
  });

  it('does NOT retry an unknown git stderr (no transient substring — default-deny)', () => {
    expect(isRetryableGitError(gitExecError('fatal: some unknown error'))).toBe(false);
  });

  it('delegates to isRetryableError for raw Node network codes (spawn-time ECONNRESET)', () => {
    expect(isRetryableGitError({ code: 'ECONNRESET' })).toBe(true);
  });

  it('stays consistent with the NXDOMAIN policy: ENOTFOUND is NOT retried', () => {
    expect(isRetryableGitError({ code: 'ENOTFOUND' })).toBe(false);
  });

  it('does NOT retry ENOENT (git binary not installed — permanent)', () => {
    expect(isRetryableGitError({ code: 'ENOENT' })).toBe(false);
  });

  it('drives withRetry to retry a transient git failure then succeed', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) throw gitExecError('fatal: RPC failed; curl 56');
        return 'cloned';
      },
      { shouldRetry: isRetryableGitError, maxAttempts: 3, baseDelayMs: 1 }
    );
    expect(result).toBe('cloned');
    expect(calls).toBe(2);
  });

  it('drives withRetry to throw immediately on a non-retryable git failure (no wasted attempts)', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw gitExecError('fatal: Repository not found');
        },
        { shouldRetry: isRetryableGitError, maxAttempts: 3, baseDelayMs: 1 }
      )
    ).rejects.toThrow();
    expect(calls).toBe(1);
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
