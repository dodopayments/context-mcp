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

  it('unknown route returns 404', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});
