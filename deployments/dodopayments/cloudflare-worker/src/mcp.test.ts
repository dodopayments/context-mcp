import { describe, it, expect, vi, beforeEach } from 'vitest';

const pineconeCtor = vi.fn();
const query = vi.fn(async () => ({
  matches: [
    {
      score: 0.9,
      metadata: {
        documentTitle: 'Webhooks',
        heading: 'Intro',
        content: 'Webhook content',
        sourceUrl: 'https://docs.dodopayments.com/webhooks',
      },
    },
  ],
}));

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: class {
    constructor(opts: unknown) {
      pineconeCtor(opts);
    }
    index() {
      return { query };
    }
  },
}));

vi.mock('openai', () => ({
  default: class {
    embeddings = { create: async () => ({ data: [{ embedding: [0.1, 0.2] }] }) };
  },
}));

const { default: worker } = await import('./index');

const env = {
  OPENAI_API_KEY: 'k',
  PINECONE_API_KEY: 'k',
  GEMINI_API_KEY: '',
  PINECONE_INDEX_NAME: 'idx',
  EMBEDDING_PROVIDER: 'openai',
  EMBEDDING_MODEL: 'text-embedding-3-large',
  EMBEDDING_DIMENSIONS: '2',
  DEFAULT_TOP_K: '10',
  MAX_TOP_K: '20',
  ENABLE_RERANK: 'false',
  RERANK_MODEL: '',
  RERANK_FETCH_COUNT: '30',
  MAX_RERANK_CHARS: '1200',
};

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

async function rpc(body: object, headers: Record<string, string> = {}) {
  const res = await worker.fetch(
    new Request('https://mcp.test/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify(body),
    }),
    env,
    ctx
  );
  const text = await res.text();
  const data = text
    .split('\n')
    .find(line => line.startsWith('data: '))
    ?.slice('data: '.length);
  return { res, json: JSON.parse(data ?? text) };
}

describe('/mcp (stateless)', () => {
  beforeEach(() => {
    pineconeCtor.mockClear();
    query.mockClear();
  });

  it('initializes without issuing a session or creating a Pinecone client', async () => {
    const { res, json } = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBeNull();
    expect(json.result.serverInfo.name).toBe('dodo-knowledge-mcp');
    expect(pineconeCtor).not.toHaveBeenCalled();
  });

  it('lists tools without creating a Pinecone client', async () => {
    const { res, json } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(res.status).toBe(200);
    expect(json.result.tools.map((t: { name: string }) => t.name)).toEqual(['search_docs']);
    expect(pineconeCtor).not.toHaveBeenCalled();
  });

  it('serves tools/call even with a stale mcp-session-id header', async () => {
    const { res, json } = await rpc(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'search_docs', arguments: { query: 'webhooks', limit: 1 } },
      },
      { 'mcp-session-id': 'stale-session-from-old-do' }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBeNull();
    expect(json.result.isError).toBeUndefined();
    expect(json.result.content[0].text).toContain('Webhook content');
    expect(pineconeCtor).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects GET with 405 instead of opening an SSE stream', async () => {
    const res = await worker.fetch(
      new Request('https://mcp.test/mcp', { headers: { Accept: 'text/event-stream' } }),
      env,
      ctx
    );
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
