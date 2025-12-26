/**
 * ContextMCP Server - Cloudflare Workers
 *
 * A self-hosted MCP documentation server.
 * Configurable via environment variables.
 *
 * Environment variables:
 * - OPENAI_API_KEY: Required for embedding generation
 * - PINECONE_API_KEY: Required for vector search
 * - SERVER_NAME: Server name shown to clients (default: contextmcp)
 * - PINECONE_INDEX_NAME: Pinecone index name (required)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { z } from 'zod';

// =============================================================================
// TYPES
// =============================================================================

interface Env {
  // Secrets
  OPENAI_API_KEY: string;
  PINECONE_API_KEY: string;

  // Configuration
  SERVER_NAME: string;
  SERVER_DESCRIPTION: string;
  PINECONE_INDEX_NAME: string;
  EMBEDDING_MODEL: string;
  DEFAULT_TOP_K: string;
  MAX_TOP_K: string;

  // Durable Object binding
  MCP_OBJECT: DurableObjectNamespace;
}

interface SearchResult {
  score: number;
  title: string;
  heading: string;
  content: string;
  url?: string;
  method?: string;
  path?: string;
  language?: string;
}

// =============================================================================
// SEARCH FUNCTIONALITY
// =============================================================================

async function generateQueryEmbedding(
  openai: OpenAI,
  query: string,
  model: string
): Promise<number[]> {
  const response = await openai.embeddings.create({
    model,
    input: [query],
  });
  return response.data[0].embedding;
}

const MAX_RERANK_CHARS = 1200;

async function rerankWithPinecone(
  pinecone: Pinecone,
  query: string,
  documents: SearchResult[],
  topN: number
): Promise<SearchResult[]> {
  try {
    const docsForRerank = documents.map((d, idx) => {
      const fullText = `${d.title} - ${d.heading}\n${d.content}`;
      const text =
        fullText.length > MAX_RERANK_CHARS ? fullText.slice(0, MAX_RERANK_CHARS) + '...' : fullText;
      return { id: String(idx), text };
    });

    const rerankResult = await pinecone.inference.rerank(
      'pinecone-rerank-v0',
      query,
      docsForRerank,
      { topN, returnDocuments: false }
    );

    return rerankResult.data.map(r => ({
      ...documents[r.index],
      score: Math.round((r.score || 0) * 100) / 100,
    }));
  } catch (error) {
    console.error('[Rerank] Failed:', error);
    return documents.slice(0, topN);
  }
}

const RERANK_FETCH_COUNT = 30;
const DEFAULT_RETURN_COUNT = 5;
const MAX_RETURN_COUNT = 20;

async function searchDocs(
  openai: OpenAI,
  pinecone: Pinecone,
  env: Env,
  query: string,
  limit: number = DEFAULT_RETURN_COUNT
): Promise<SearchResult[]> {
  const returnCount = Math.min(Math.max(1, limit), MAX_RETURN_COUNT);
  const index = pinecone.index(env.PINECONE_INDEX_NAME);
  const queryEmbedding = await generateQueryEmbedding(openai, query, env.EMBEDDING_MODEL);

  const results = await index.query({
    vector: queryEmbedding,
    topK: RERANK_FETCH_COUNT,
    includeMetadata: true,
  });

  const searchResults: SearchResult[] =
    results.matches?.map(match => ({
      score: Math.round((match.score || 0) * 100) / 100,
      title: String(match.metadata?.documentTitle || ''),
      heading: String(match.metadata?.heading || ''),
      content: String(match.metadata?.content || ''),
      url: match.metadata?.sourceUrl as string | undefined,
      method: match.metadata?.method as string | undefined,
      path: match.metadata?.path as string | undefined,
      language: match.metadata?.language as string | undefined,
    })) || [];

  if (searchResults.length > 0) {
    return rerankWithPinecone(pinecone, query, searchResults, returnCount);
  }

  return [];
}

function formatResults(results: SearchResult[], query: string, serverName: string): string {
  const lines: string[] = [
    `# ${serverName} Documentation`,
    `> Query: ${query}`,
    `> Results: ${results.length}`,
    '',
  ];

  const separator = '-'.repeat(40);

  results.forEach(result => {
    lines.push(separator);
    lines.push(`## ${result.title}`);
    if (result.url) lines.push(`Source: ${result.url}`);
    if (result.method && result.path) lines.push(`API: ${result.method} ${result.path}`);
    if (result.language) lines.push(`Language: ${result.language}`);
    lines.push('');
    lines.push(result.content);
    lines.push('');
  });

  return lines.join('\n');
}

// =============================================================================
// MCP AGENT
// =============================================================================

export class ContextMCP extends McpAgent<Env> {
  server = new McpServer({
    name: this.env.SERVER_NAME || 'contextmcp',
    version: '1.0.0',
  });

  async init() {
    const env = this.env;
    const serverName = env.SERVER_NAME || 'contextmcp';
    const description = env.SERVER_DESCRIPTION || 'Search documentation';

    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });

    this.server.registerTool(
      'search_docs',
      {
        title: `Search ${serverName} Documentation`,
        description: description,
        inputSchema: {
          query: z
            .string()
            .describe(
              'Search query - describe what you want to find in the documentation. Be specific.'
            ),
          limit: z
            .number()
            .min(1)
            .max(20)
            .optional()
            .describe('Number of results to return (default: 5, max: 20)'),
        },
      },
      async ({ query, limit }) => {
        try {
          const results = await searchDocs(openai, pinecone, env, query, limit);
          const formatted = formatResults(results, query, serverName);

          return {
            content: [{ type: 'text', text: formatted }],
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return {
            content: [
              {
                type: 'text',
                text: `Error searching documentation: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }
}

// =============================================================================
// LANDING PAGE
// =============================================================================

function generateLandingPage(baseUrl: string, serverName: string): string {
  const mcpUrl = `${baseUrl}/mcp`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${serverName} - ContextMCP</title>
  <style>
    :root { --bg: #0a0a0a; --fg: #fafafa; --accent: #3b82f6; --muted: #71717a; }
    body { 
      font-family: system-ui, sans-serif; 
      max-width: 800px; 
      margin: 0 auto; 
      padding: 2rem; 
      line-height: 1.6; 
      background: var(--bg); 
      color: var(--fg); 
    }
    pre, code { background: #1e1e1e; color: #d4d4d4; }
    pre { padding: 1rem; border-radius: 8px; overflow-x: auto; border: 1px solid #333; }
    code { padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; }
    h1 { margin-bottom: 0.5rem; color: var(--accent); }
    h2 { margin-top: 2rem; color: var(--fg); }
    a { color: var(--accent); }
    hr { margin: 2rem 0; border: none; border-top: 1px solid #333; }
    .badge { 
      display: inline-block; 
      background: var(--accent); 
      color: white; 
      padding: 0.25rem 0.75rem; 
      border-radius: 9999px; 
      font-size: 0.85rem; 
      margin-bottom: 1rem; 
    }
    .muted { color: var(--muted); }
  </style>
</head>
<body>
  <span class="badge">MCP Server</span>
  <h1>${serverName}</h1>
  <p class="muted">Powered by ContextMCP - Self-hosted MCP for your documentation</p>
  
  <p>This MCP server is available at:</p>
  <pre>${mcpUrl}</pre>

  <h2>Cursor</h2>
  <p>Add to <code>~/.cursor/mcp.json</code>:</p>
  <pre>{
  "mcpServers": {
    "${serverName}": {
      "url": "${mcpUrl}"
    }
  }
}</pre>

  <h2>Windsurf</h2>
  <p>Add to <code>~/.codeium/windsurf/mcp_config.json</code>:</p>
  <pre>{
  "mcpServers": {
    "${serverName}": {
      "serverUrl": "${mcpUrl}"
    }
  }
}</pre>

  <h2>Claude Desktop</h2>
  <p>Add to your Claude Desktop config:</p>
  <pre>{
  "mcpServers": {
    "${serverName}": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "${mcpUrl}"]
    }
  }
}</pre>

  <h2>REST API</h2>
  <pre>GET /search?query=your+search+query&limit=5</pre>

  <hr>
  <p class="muted">
    <a href="https://github.com/contextmcp/contextmcp">ContextMCP</a> - 
    Self-hosted MCP for your documentation
  </p>
</body>
</html>`;
}

// =============================================================================
// CLOUDFLARE WORKERS HANDLER
// =============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const serverName = env.SERVER_NAME || 'contextmcp';

    // MCP endpoint
    if (url.pathname === '/mcp') {
      return ContextMCP.serve('/mcp').fetch(request, env, ctx);
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: serverName,
          version: '1.0.0',
          endpoints: {
            mcp: '/mcp',
            rest: 'GET /search?query=...',
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // REST API
    if (url.pathname === '/search') {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      try {
        let query: string | null = null;
        let limit = 5;

        if (request.method === 'GET') {
          query = url.searchParams.get('query');
          const limitParam = url.searchParams.get('limit');
          if (limitParam) limit = parseInt(limitParam, 10) || limit;
        } else if (request.method === 'POST') {
          const body = (await request.json()) as { query?: string; limit?: number };
          query = body.query || null;
          if (body.limit) limit = body.limit;
        } else {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        if (!query) {
          return new Response(JSON.stringify({ error: 'Missing required parameter: query' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
        const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });
        const results = await searchDocs(openai, pinecone, env, query, limit);
        const formatted = formatResults(results, query, serverName);

        return new Response(formatted, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            ...corsHeaders,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Landing page
    if (url.pathname === '/') {
      const html = generateLandingPage(url.origin, serverName);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
