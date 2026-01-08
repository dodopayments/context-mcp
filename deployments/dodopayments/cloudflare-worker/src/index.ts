/**
 * Dodo Payments MCP Server - Cloudflare Workers
 *
 * A remote MCP server with built-in Pinecone search.
 * Uses Cloudflare's agents framework for proper MCP support.
 *
 * Environment variables (set via wrangler secret):
 * - OPENAI_API_KEY: Required for embedding generation
 * - PINECONE_API_KEY: Required for vector search
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
  // Secrets (set via wrangler secret put)
  OPENAI_API_KEY: string;
  PINECONE_API_KEY: string;

  // Variables (set in wrangler.jsonc)
  PINECONE_INDEX_NAME: string;
  EMBEDDING_MODEL: string;
  DEFAULT_TOP_K: string;
  MAX_TOP_K: string;

  // Reranking configuration
  ENABLE_RERANK: string;
  RERANK_MODEL: string;
  RERANK_FETCH_COUNT: string;
  MAX_RERANK_CHARS: string;

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

// =============================================================================
// PINECONE RE-RANKING
// =============================================================================

async function rerankWithPinecone(
  pinecone: Pinecone,
  query: string,
  documents: SearchResult[],
  topN: number,
  env: Env
): Promise<SearchResult[]> {
  try {
    const maxRerankChars = parseInt(env.MAX_RERANK_CHARS, 10) || 1200;
    const rerankModel = env.RERANK_MODEL || 'pinecone-rerank-v0';

    const docsForRerank = documents.map((d, idx) => {
      const fullText = `${d.title} - ${d.heading}\n${d.content}`;
      const text =
        fullText.length > maxRerankChars ? fullText.slice(0, maxRerankChars) + '...' : fullText;
      return { id: String(idx), text };
    });

    const rerankResult = await pinecone.inference.rerank(rerankModel, query, docsForRerank, {
      topN,
      returnDocuments: false,
    });

    return rerankResult.data.map(r => ({
      ...documents[r.index],
      score: Math.round((r.score || 0) * 100) / 100,
    }));
  } catch (error) {
    console.error('[Rerank] Failed:', error);
    return documents.slice(0, topN);
  }
}

async function searchDocs(
  openai: OpenAI,
  pinecone: Pinecone,
  env: Env,
  query: string,
  limit?: number
): Promise<SearchResult[]> {
  const defaultTopK = parseInt(env.DEFAULT_TOP_K, 10) || 10;
  const maxTopK = parseInt(env.MAX_TOP_K, 10) || 20;
  const rerankEnabled = env.ENABLE_RERANK !== 'false';
  const rerankFetchCount = parseInt(env.RERANK_FETCH_COUNT, 10) || 30;

  const returnCount = Math.min(Math.max(1, limit ?? defaultTopK), maxTopK);
  const index = pinecone.index(env.PINECONE_INDEX_NAME);
  const queryEmbedding = await generateQueryEmbedding(openai, query, env.EMBEDDING_MODEL);

  const fetchCount = rerankEnabled ? rerankFetchCount : returnCount;

  const results = await index.query({
    vector: queryEmbedding,
    topK: fetchCount,
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

  if (searchResults.length > 0 && rerankEnabled) {
    return rerankWithPinecone(pinecone, query, searchResults, returnCount, env);
  }

  return searchResults.slice(0, returnCount);
}

function formatResults(results: SearchResult[], query: string): string {
  const lines: string[] = [
    '# Dodo Payments Documentation',
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
// MCP SERVER
// =============================================================================

export class DodoKnowledgeMCP extends McpAgent<Env> {
  server = new McpServer({
    name: 'dodo-knowledge-mcp',
    version: '1.0.0',
  });

  async init() {
    const env = this.env;
    const defaultTopK = parseInt(env.DEFAULT_TOP_K || '10', 10);

    // Initialize clients
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });

    // Register the search_docs tool
    this.server.registerTool(
      'search_docs',
      {
        title: 'Search Dodo Payments Documentation',
        description:
          'Search the Dodo Payments documentation using semantic search across API Reference, SDK docs, BillingSDK, and guides.',
        inputSchema: {
          query: z
            .string()
            .describe(
              'Search query - describe what you want to find in the documentation. Be specific and mention the framework/language or any other relevant information in query for precise retrieval'
            ),
          limit: z
            .number()
            .min(1)
            .max(parseInt(env.MAX_TOP_K, 10) || 20)
            .optional()
            .describe(
              `Number of results to return (default: ${env.DEFAULT_TOP_K || '10'}, max: ${env.MAX_TOP_K || '20'})`
            ),
        },
      },
      async ({ query, limit }) => {
        try {
          const results = await searchDocs(openai, pinecone, env, query, limit);
          const formatted = formatResults(results, query);

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

function generateLandingPage(baseUrl: string): string {
  const mcpUrl = `${baseUrl}/mcp`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dodo Knowledge MCP</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
    pre, code { background: #1e1e1e; color: #d4d4d4; }
    pre { padding: 1rem; border-radius: 6px; overflow-x: auto; }
    code { padding: 0.2rem 0.4rem; border-radius: 3px; font-size: 0.9em; }
    h1 { margin-bottom: 0.5rem; }
    h2 { margin-top: 2rem; }
    a { color: #0066cc; }
    hr { margin: 2rem 0; border: none; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <h1>Dodo Knowledge MCP</h1>
  <p>This MCP server is available at:</p>
  <pre>${mcpUrl}</pre>

  <h2>Cursor</h2>
  <ol>
    <li>Edit your Cursor MCP configuration file at <code>~/.cursor/mcp.json</code></li>
    <li>Add the following configuration:</li>
  </ol>
  <pre>{
  "mcpServers": {
    "dodo-knowledge-mcp": {
      "url": "${mcpUrl}"
    }
  }
}</pre>

  <h2>Windsurf</h2>
  <ol>
    <li>Edit your Windsurf configuration file at <code>~/.codeium/windsurf/mcp_config.json</code></li>
    <li>Add the following configuration:</li>
  </ol>
  <pre>{
  "mcpServers": {
    "dodo-knowledge-mcp": {
      "serverUrl": "${mcpUrl}"
    }
  }
}</pre>

  <h2>Claude Desktop</h2>
  <p>Claude Desktop requires using the <code>mcp-remote</code> package:</p>
  <ol>
    <li>Edit your Claude Desktop configuration file:
      <ol>
        <li>macOS: <code>~/Library/Application Support/Claude/claude_desktop_config.json</code></li>
        <li>Windows: <code>%APPDATA%\\Claude\\claude_desktop_config.json</code></li>
      </ol>
    </li>
    <li>Add the following configuration:</li>
  </ol>
  <pre>{
  "mcpServers": {
    "dodo-knowledge-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "${mcpUrl}"]
    }
  }
}</pre>
  <ol start="3">
    <li>Restart Claude Desktop (look for the hammer icon)</li>
  </ol>

  <h2>Troubleshooting</h2>
  <p>If you encounter issues connecting:</p>
  <ol>
    <li>Ensure you have Node.js 18 or higher installed</li>
    <li>Try clearing MCP authentication cache: <code>rm -rf ~/.mcp-auth</code></li>
    <li>Restart your MCP client application</li>
    <li>Check client logs for error messages</li>
  </ol>

  <h2>Learn More</h2>
  <p>For more information about MCP:</p>
  <ul>
    <li><a href="https://modelcontextprotocol.io">MCP Introduction</a></li>
    <li><a href="https://www.npmjs.com/package/mcp-remote">mcp-remote package</a></li>
  </ul>

  <hr>
  <p>&copy; ${new Date().getFullYear()} DodoPayments. All rights reserved.</p>
</body>
</html>`;
}

// =============================================================================
// CLOUDFLARE WORKERS HANDLER
// =============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // MCP endpoint (Streamable HTTP)
    if (url.pathname === '/mcp') {
      return DodoKnowledgeMCP.serve('/mcp').fetch(request, env, ctx);
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'dodo-knowledge-mcp',
          endpoints: {
            mcp: '/mcp',
            rest: 'GET /search?query=...',
          },
          pineconeIndex: env.PINECONE_INDEX_NAME,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // REST API endpoint for direct search
    if (url.pathname === '/search') {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      try {
        let query: string | null = null;
        let limit: number | undefined = undefined;

        if (request.method === 'GET') {
          // GET /search?query=...&limit=...
          query = url.searchParams.get('query');
          const limitParam = url.searchParams.get('limit');
          if (limitParam) limit = parseInt(limitParam, 10) || limit;
        } else if (request.method === 'POST') {
          // POST /search with JSON body
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
        const formatted = formatResults(results, query);

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
      const baseUrl = url.origin;
      const html = generateLandingPage(baseUrl);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
