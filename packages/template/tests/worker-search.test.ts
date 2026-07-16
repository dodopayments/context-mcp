/**
 * Tests for the Cloudflare worker's REST /search endpoint against the
 * configured vector backend. Guards the end-to-end Qdrant path: with
 * VECTORDB_PROVIDER=qdrant, /search must query Qdrant, not Pinecone.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// The cloudflare-worker package is not an npm workspace, so its unique deps
// (`agents`, `@modelcontextprotocol/sdk`) are not installed by a root
// `npm install`. Mock the module-scope surface the worker touches; neither
// class does real work in the REST /search path under test.
vi.mock('agents/mcp', () => ({
  McpAgent: class McpAgent {},
}));
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class McpServer {
    registerTool(): void {}
  },
}));

import worker from '../cloudflare-worker/src/index';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

/**
 * Qdrant-only worker env: no PINECONE_API_KEY on purpose — a Qdrant
 * deployment must be able to serve without one. Ollama is used as the
 * embedding provider because it talks plain fetch (interceptable below).
 */
function qdrantEnv(overrides: Record<string, string> = {}) {
  return {
    VECTORDB_PROVIDER: 'qdrant',
    QDRANT_URL: 'http://qdrant.test:6333',
    QDRANT_COLLECTION: 'docs',
    EMBEDDING_PROVIDER: 'ollama',
    OLLAMA_BASE_URL: 'http://ollama.test:11434',
    EMBEDDING_MODEL: 'nomic-embed-text',
    SERVER_NAME: 'testdocs',
    ...overrides,
  } as never;
}

function mockBackends() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('http://ollama.test:11434/api/embed')) {
      return new Response(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }), { status: 200 });
    }
    if (url.startsWith('http://qdrant.test:6333/collections/docs/points/search')) {
      void init;
      return new Response(
        JSON.stringify({
          result: [
            {
              score: 0.87,
              payload: {
                documentTitle: 'Qdrant Doc',
                heading: 'Install',
                content: 'hello from qdrant',
                sourceUrl: 'https://docs.example.com/install',
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    // Anything else (e.g. a stray Pinecone call) is a wrong-backend bug.
    return new Response(`unexpected backend call: ${url}`, { status: 599 });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('worker REST /search with VECTORDB_PROVIDER=qdrant', () => {
  it('serves results from Qdrant (no Pinecone key required)', async () => {
    mockBackends();

    const res = await worker.fetch(
      new Request('https://worker.test/search?query=install'),
      qdrantEnv(),
      {} as never
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Qdrant Doc');
    expect(text).toContain('hello from qdrant');
  });

  it('scopes the Qdrant search to VECTORDB_NAMESPACE when set', async () => {
    const fetchMock = mockBackends();

    const res = await worker.fetch(
      new Request('https://worker.test/search?query=install'),
      qdrantEnv({ VECTORDB_NAMESPACE: 'team-a' }),
      {} as never
    );

    expect(res.status).toBe(200);
    const searchCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('/points/search')
    );
    expect(searchCall).toBeDefined();
    const body = JSON.parse(String(searchCall![1]?.body));
    expect(body.filter).toEqual({
      must: [{ key: '_namespace', match: { value: 'team-a' } }],
    });
  });
});
