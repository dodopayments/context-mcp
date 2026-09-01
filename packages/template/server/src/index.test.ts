import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { startServer } from './index.js';
import { loadServerConfig } from './config.js';

/**
 * HTTP-level tests for request validation. These exercise paths that return
 * before any Pinecone network call (bad/oversized JSON, missing query, unknown
 * route), so no real API keys are needed.
 */
describe('server request validation', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const config = loadServerConfig({
      PINECONE_API_KEY: 'pk-test',
      PINECONE_INDEX_NAME: 'docs',
      PORT: '0', // ephemeral port
    });
    server = startServer(config);
    await new Promise<void>(resolve => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('GET /health returns 200 ok', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('POST /search with malformed JSON returns 400 (not 500)', async () => {
    const res = await fetch(`${base}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not valid json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/invalid json/i);
  });

  it('POST /search with no query returns 400', async () => {
    const res = await fetch(`${base}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 5 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/query/i);
  });

  it('POST /search with an oversized body returns 413', async () => {
    const huge = JSON.stringify({ query: 'x'.repeat(1024 * 1024 + 10) });
    const res = await fetch(`${base}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: huge,
    });
    expect(res.status).toBe(413);
  });

  it('POST /search with a non-string query returns 400 (not 500)', async () => {
    for (const query of [123, true, { evil: true }, ['a', 'b'], null]) {
      const res = await fetch(`${base}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      expect(res.status, `query=${JSON.stringify(query)}`).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/query/i);
    }
  });

  it('POST /search with a whitespace-only query returns 400', async () => {
    const res = await fetch(`${base}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '   ' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/query/i);
  });

  it('POST /search with a non-numeric limit returns 400 (no NaN topK to backend)', async () => {
    const res = await fetch(`${base}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'hi', limit: 'abc' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/limit/i);
  });

  it('POST /search with an out-of-range limit returns 400', async () => {
    for (const limit of [0, -5, 999999, 1.5]) {
      const res = await fetch(`${base}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'hi', limit }),
      });
      expect(res.status, `limit=${limit}`).toBe(400);
    }
  });

  it('POST /search with a non-object body returns 400', async () => {
    const res = await fetch(`${base}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify('just a string'),
    });
    expect(res.status).toBe(400);
  });

  it('unknown route returns 404', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});

/**
 * CORS behavior on /search, matching the Cloudflare worker's REST endpoint so
 * a browser-based client can call either deployment target directly. /mcp and
 * /health intentionally don't get these headers (not subject to CORS).
 */
describe('server /search CORS', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const config = loadServerConfig({
      PINECONE_API_KEY: 'pk-test',
      PINECONE_INDEX_NAME: 'docs',
      PORT: '0',
    });
    server = startServer(config);
    await new Promise<void>(resolve => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('OPTIONS /search returns a 204 CORS preflight response', async () => {
    const res = await fetch(`${base}/search`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    expect(res.headers.get('access-control-allow-headers')).toContain('Content-Type');
  });

  it('GET /search with no query returns 400 with CORS headers', async () => {
    const res = await fetch(`${base}/search`);
    expect(res.status).toBe(400);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/query/i);
  });

  it('GET /search with a non-integer limit returns 400', async () => {
    const res = await fetch(`${base}/search?query=hi&limit=abc`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/limit/i);
  });

  it('GET /search with an out-of-range limit returns 400', async () => {
    for (const limit of ['0', '-5', '999999', '1.5']) {
      const res = await fetch(`${base}/search?query=hi&limit=${limit}`);
      expect(res.status, `limit=${limit}`).toBe(400);
    }
  });

  it('POST /search error responses (e.g. malformed JSON) still carry CORS headers', async () => {
    const res = await fetch(`${base}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not valid json',
    });
    expect(res.status).toBe(400);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('DELETE /search (unsupported method) returns 405 with CORS headers', async () => {
    const res = await fetch(`${base}/search`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('/health does not carry CORS headers (not part of the CORS-enabled surface)', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
