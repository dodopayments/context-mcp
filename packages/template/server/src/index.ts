/**
 * ContextMCP self-hostable Node.js server
 *
 * Serves the same documentation search as the Cloudflare worker, but as a
 * long-running Node process you can host anywhere (Docker, a VM, Fly.io, etc.).
 *
 * Endpoints:
 * - POST /mcp     MCP Streamable HTTP transport (stateless)
 * - POST /search  REST search: { "query": "...", "limit": 10 } -> JSON results
 * - GET  /health  Liveness probe
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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

export function startServer(config: ServerConfig = loadServerConfig()) {
  const pinecone = new Pinecone({ apiKey: config.pineconeApiKey });

  const httpServer = createServer((req, res) => {
    void handleRequest(req, res, pinecone, config).catch(error => {
      // Client errors (bad/oversized JSON) map to their 4xx status; everything
      // else is an unexpected server fault.
      if (error instanceof BadRequestError) {
        if (!res.headersSent) sendJson(res, error.status, { error: error.message });
        return;
      }
      console.error('[Server] Unhandled error:', error);
      if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
    });
  });

  httpServer.listen(config.port, () => {
    console.log(`🚀 ContextMCP server "${config.serverName}" listening on :${config.port}`);
    console.log(`   MCP:    POST http://localhost:${config.port}/mcp`);
    console.log(`   Search: POST http://localhost:${config.port}/search`);
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

  // REST search endpoint.
  if (url.pathname === '/search' && req.method === 'POST') {
    const body = (await readJsonBody(req)) as { query?: string; limit?: number } | undefined;
    if (!body?.query) {
      sendJson(res, 400, { error: 'Missing "query" in request body' });
      return;
    }
    const results = await searchDocs(pinecone, config, body.query, body.limit);
    sendJson(res, 200, { query: body.query, count: results.length, results });
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
