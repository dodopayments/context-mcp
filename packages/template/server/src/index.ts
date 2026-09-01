/**
 * ContextMCP self-hostable Node.js server
 *
 * Serves the same documentation search as the Cloudflare worker, but as a
 * long-running Node process you can host anywhere (Docker, a VM, Fly.io, etc.).
 *
 * Endpoints:
 * - POST /mcp        MCP Streamable HTTP transport (stateless)
 * - GET/POST /search REST search (CORS-enabled): ?query=&limit= or
 *                    { "query": "...", "limit": 10 } -> JSON results
 * - GET /health      Liveness probe
 */

import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Pinecone } from '@pinecone-database/pinecone';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { loadServerConfig, type ServerConfig } from './config.js';
import { searchDocs, formatResults } from './search.js';

/** Build an MCP server exposing the search_docs tool. */
export function createMcpServer(pinecone: Pinecone, config: ServerConfig): McpServer {
  const server = new McpServer({ name: config.serverName, version: '1.0.0' });

  server.registerTool(
    'search_docs',
    {
      title: `Search ${config.serverName} Documentation`,
      description: config.serverDescription,
      inputSchema: {
        query: z
          .string()
          .describe('Search query - describe what you want to find in the documentation.'),
        limit: z
          .number()
          .min(1)
          .max(config.maxTopK)
          .optional()
          .describe(`Number of results (default: ${config.defaultTopK}, max: ${config.maxTopK})`),
      },
    },
    async ({ query, limit }) => {
      const results = await searchDocs(pinecone, config, query, limit);
      return {
        content: [{ type: 'text', text: formatResults(results, query, config.serverName) }],
      };
    }
  );

  return server;
}

/** Maximum accepted request body size (1 MiB) — guards against unbounded reads. */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * CORS headers for `/search`, matching the Cloudflare worker's REST endpoint
 * so a browser-based client can call either deployment target directly.
 * `/mcp` and `/health` intentionally don't get these (same as the worker) —
 * MCP clients and health probes aren't subject to CORS.
 */
const SEARCH_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/** A client error that should map to a 4xx response rather than a 500. */
class BadRequestError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = 'BadRequestError';
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      throw new BadRequestError('Request body too large', 413);
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    // Malformed JSON is a client error (400), not a server fault (500).
    throw new BadRequestError('Invalid JSON in request body');
  }
}

/**
 * Validate and normalize a /search request body. Throws BadRequestError (→ 400)
 * for any client mistake, keeping the REST contract identical to the zod-checked
 * MCP tool: `query` must be a non-empty string; `limit`, if present, must be an
 * integer in [1, maxTopK].
 */
function parseSearchBody(body: unknown, maxTopK: number): { query: string; limit?: number } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestError('Request body must be a JSON object');
  }
  const { query, limit } = body as { query?: unknown; limit?: unknown };

  if (typeof query !== 'string') {
    throw new BadRequestError('"query" must be a string');
  }
  if (query.trim().length === 0) {
    throw new BadRequestError('"query" must not be empty');
  }

  if (limit === undefined || limit === null) {
    return { query };
  }
  if (typeof limit !== 'number' || !Number.isFinite(limit) || !Number.isInteger(limit)) {
    throw new BadRequestError('"limit" must be an integer');
  }
  if (limit < 1 || limit > maxTopK) {
    throw new BadRequestError(`"limit" must be between 1 and ${maxTopK}`);
  }
  return { query, limit };
}

/**
 * Validate and normalize `?query=&limit=` on a GET /search request. Mirrors
 * `parseSearchBody`'s rules (non-empty query string; limit, if present, an
 * integer in [1, maxTopK]) so GET and POST enforce the exact same contract.
 */
function parseSearchQueryParams(
  searchParams: URLSearchParams,
  maxTopK: number
): { query: string; limit?: number } {
  const query = searchParams.get('query');
  if (query === null || query.trim().length === 0) {
    throw new BadRequestError('"query" must not be empty');
  }

  const limitParam = searchParams.get('limit');
  if (limitParam === null) {
    return { query };
  }
  // Reject anything that isn't a plain integer (no floats, no leading '+',
  // no whitespace) before parsing, so e.g. "5abc" or "1.5" don't silently
  // coerce into a number via Number()/parseInt().
  if (!/^-?\d+$/.test(limitParam)) {
    throw new BadRequestError('"limit" must be an integer');
  }
  const limit = Number(limitParam);
  if (limit < 1 || limit > maxTopK) {
    throw new BadRequestError(`"limit" must be between 1 and ${maxTopK}`);
  }
  return { query, limit };
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
  res.end(payload);
}

/** Cheap check of whether a raw request URL targets /search, for CORS on error paths. */
function isSearchPath(rawUrl: string | undefined): boolean {
  try {
    return new URL(rawUrl || '/', 'http://localhost').pathname === '/search';
  } catch {
    return false;
  }
}

export function startServer(config: ServerConfig = loadServerConfig()) {
  const pinecone = new Pinecone({ apiKey: config.pineconeApiKey });

  const httpServer = createServer((req, res) => {
    void handleRequest(req, res, pinecone, config).catch(error => {
      // /search is CORS-enabled (see SEARCH_CORS_HEADERS); its error responses
      // need the same headers as its success responses, or a browser client
      // can't read the error body/status either.
      const corsHeaders = isSearchPath(req.url) ? SEARCH_CORS_HEADERS : {};
      // Client errors (bad/oversized JSON) map to their 4xx status; everything
      // else is an unexpected server fault.
      if (error instanceof BadRequestError) {
        if (!res.headersSent) sendJson(res, error.status, { error: error.message }, corsHeaders);
        return;
      }
      console.error('[Server] Unhandled error:', error);
      if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' }, corsHeaders);
    });
  });

  httpServer.listen(config.port, () => {
    console.log(`🚀 ContextMCP server "${config.serverName}" listening on :${config.port}`);
    console.log(`   MCP:    POST http://localhost:${config.port}/mcp`);
    console.log(`   Search: GET/POST http://localhost:${config.port}/search`);
    console.log(`   Health: GET  http://localhost:${config.port}/health`);
  });

  return httpServer;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pinecone: Pinecone,
  config: ServerConfig
): Promise<void> {
  const url = new URL(req.url || '/', `http://localhost:${config.port}`);

  // Health check.
  if (url.pathname === '/health' && req.method === 'GET') {
    sendJson(res, 200, { status: 'ok', server: config.serverName });
    return;
  }

  // REST search endpoint. CORS-enabled (unlike /mcp and /health) so a
  // browser-based client can call it directly — matching the Cloudflare
  // worker's /search, which supports the same GET/POST/OPTIONS + headers.
  if (url.pathname === '/search') {
    if (req.method === 'OPTIONS') {
      // CORS preflight: no body, just the allow-list headers.
      res.writeHead(204, SEARCH_CORS_HEADERS);
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' }, SEARCH_CORS_HEADERS);
      return;
    }

    // Validate request shape at the boundary so wrong types become a clean 400
    // instead of a 500 (or NaN topK forwarded to Pinecone). This mirrors the
    // zod schema enforced on the MCP tool path, for both GET query params and
    // a POST JSON body.
    const { query, limit } =
      req.method === 'GET'
        ? parseSearchQueryParams(url.searchParams, config.maxTopK)
        : parseSearchBody(await readJsonBody(req), config.maxTopK);

    const results = await searchDocs(pinecone, config, query, limit);
    sendJson(res, 200, { query, count: results.length, results }, SEARCH_CORS_HEADERS);
    return;
  }

  // MCP Streamable HTTP transport (stateless: a fresh transport per request).
  if (url.pathname === '/mcp' && req.method === 'POST') {
    const server = createMcpServer(pinecone, config);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    const body = await readJsonBody(req);
    await transport.handleRequest(req, res, body);
    return;
  }

  sendJson(res, 404, { error: 'Not found', endpoints: ['/mcp', '/search', '/health'] });
}

// Start automatically when run directly (not when imported by tests).
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startServer();
}
