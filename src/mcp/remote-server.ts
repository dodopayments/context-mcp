/**
 * Dodo Payments Remote MCP Server (Standalone)
 *
 * A self-contained remote MCP server with built-in Pinecone search.
 * No separate API server required - just deploy this one service.
 *
 * Usage:
 *   npm run mcp:remote
 *
 * Environment variables:
 * - OPENAI_API_KEY: Required for embedding generation
 * - PINECONE_API_KEY: Required for vector search
 * - MCP_PORT: Port for MCP server (default: 3001)
 */

import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import 'dotenv/config';

import { PINECONE_INDEX_NAME, EMBEDDING_MODEL, DEFAULT_TOP_K, MAX_TOP_K } from '../config/index.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const MCP_PORT = parseInt(process.env.MCP_PORT || '3001', 10);

// Validate environment
function validateEnv(): void {
  const required = ['OPENAI_API_KEY', 'PINECONE_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ Missing environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// =============================================================================
// SEARCH FUNCTIONALITY (built-in)
// =============================================================================

let openai: OpenAI;
let pinecone: Pinecone;

function initClients(): void {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
}

async function generateQueryEmbedding(query: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: [query],
  });
  return response.data[0].embedding;
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

async function searchDocs(query: string, limit: number = DEFAULT_TOP_K): Promise<SearchResult[]> {
  const index = pinecone.index(PINECONE_INDEX_NAME);
  const queryEmbedding = await generateQueryEmbedding(query);

  const results = await index.query({
    vector: queryEmbedding,
    topK: Math.min(limit, MAX_TOP_K),
    includeMetadata: true,
  });

  return (
    results.matches?.map(match => ({
      score: Math.round((match.score || 0) * 100) / 100,
      title: String(match.metadata?.documentTitle || ''),
      heading: String(match.metadata?.heading || ''),
      content: String(match.metadata?.content || ''),
      url: match.metadata?.sourceUrl as string | undefined,
      method: match.metadata?.method as string | undefined,
      path: match.metadata?.path as string | undefined,
      language: match.metadata?.language as string | undefined,
    })) || []
  );
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
// MCP SERVER FACTORY
// =============================================================================

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'dodo-knowledge-mcp',
    version: '1.0.0',
  });

  server.registerTool(
    'search_docs',
    {
      title: 'Search Dodo Payments Documentation',
      description: `Search the Dodo Payments documentation using semantic search.

This tool searches across:
- **API Reference** - REST API endpoints, request/response schemas, error codes
- **SDK Documentation** - TypeScript, Python, Go, PHP, Java, Ruby SDK guides
- **BillingSDK** - React billing components (pricing tables, payment forms, etc.)
- **Features** - Payments, subscriptions, webhooks, license keys, customer portal
- **Guides** - Integration tutorials, best practices, troubleshooting

Returns relevant documentation snippets with URLs to the full documentation.

Examples:
- "how to create a payment"
- "webhook signature verification"
- "typescript SDK installation"
- "pricing table component react"
- "subscription lifecycle events"`,
      inputSchema: {
        query: z
          .string()
          .describe(
            'Search query - describe what you want to find in the documentation. Be specific and mention the framework/language or any other relevant information in query for precise retrival'
          ),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe('Number of results (default: 10, max: 50)'),
      },
    },
    async ({ query, limit }) => {
      try {
        const results = await searchDocs(query, limit || DEFAULT_TOP_K);
        const formatted = formatResults(results, query);

        return {
          content: [{ type: 'text', text: formatted }],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error searching documentation: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

// =============================================================================
// EXPRESS APP & TRANSPORT MANAGEMENT
// =============================================================================

const app = express();
app.use(express.json());

const transports: Record<string, StreamableHTTPServerTransport> = {};

// CORS for remote access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Last-Event-ID');
  res.header('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// =============================================================================
// MCP ROUTES
// =============================================================================

app.post('/mcp', async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: sid => {
          console.log(`Session initialized: ${sid}`);
          transports[sid] = transport;
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.log(`Session closed: ${sid}`);
          delete transports[sid];
        }
      };

      const server = createMcpServer();
      await server.connect(transport);

      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID' },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

app.get('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

app.delete('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

// =============================================================================
// HEALTH & INFO
// =============================================================================

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'dodo-knowledge-mcp',
    transport: 'streamable-http',
    activeSessions: Object.keys(transports).length,
    pineconeIndex: PINECONE_INDEX_NAME,
  });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'Dodo Payments Remote MCP Server',
    transport: 'Streamable HTTP',
    endpoint: '/mcp',
    tool: 'search_docs',
    config: `Add to your MCP client: { "url": "http://localhost:${MCP_PORT}/mcp" }`,
  });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function main(): Promise<void> {
  validateEnv();
  initClients();

  // Test Pinecone connection
  try {
    const index = pinecone.index(PINECONE_INDEX_NAME);
    const stats = await index.describeIndexStats();
    console.log(`✅ Pinecone connected: ${stats.totalRecordCount} vectors`);
  } catch (err: any) {
    console.warn(`⚠️  Pinecone warning: ${err.message}`);
  }

  app.listen(MCP_PORT, () => {
    console.log(`\n🚀 Dodo Payments MCP Server (Standalone)`);
    console.log(`   Transport: Streamable HTTP`);
    console.log(`   Endpoint: http://localhost:${MCP_PORT}/mcp`);
    console.log(`   Index: ${PINECONE_INDEX_NAME}`);
    console.log(`\n   Health: http://localhost:${MCP_PORT}/health`);
    console.log(`\n   Add to MCP config:`);
    console.log(`   "dodo-knowledge-mcp": { "url": "http://localhost:${MCP_PORT}/mcp" }`);
  });
}

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  for (const sid in transports) {
    await transports[sid].close();
  }
  process.exit(0);
});

main().catch(error => {
  console.error('❌ Server error:', error);
  process.exit(1);
});
