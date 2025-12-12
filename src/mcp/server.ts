/**
 * Dodo Payments MCP Server
 *
 * An MCP server that provides semantic search over Dodo Payments documentation
 * by calling the documentation API.
 *
 * Usage:
 *   npx tsx src/mcp/server.ts
 *
 * Environment variables:
 * - DODO_DOCS_API_URL: API base URL (default: http://localhost:3000)
 *
 * The API server (npm run api) must be running, or point to a remote API.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';

const API_BASE_URL = process.env.DODO_DOCS_API_URL || 'http://localhost:3000';
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Call the documentation search API
 */
async function searchDocs(query: string, limit: number = DEFAULT_LIMIT): Promise<string> {
  const url = new URL('/llms.txt', API_BASE_URL);
  url.searchParams.set('topic', query);
  url.searchParams.set('limit', String(Math.min(limit, MAX_LIMIT)));

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  return response.text();
}

/**
 * Check if the API is available
 */
async function checkApiHealth(): Promise<boolean> {
  try {
    const url = new URL('/health', API_BASE_URL);
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// MCP SERVER
// ============================================================================

const server = new McpServer({
  name: 'dodo-knowledge-mcp',
  version: '1.0.0',
});

// Register the search tool
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
        .describe('Search query - describe what you want to find in the documentation.'),
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
      const results = await searchDocs(query, limit || DEFAULT_LIMIT);

      return {
        content: [{ type: 'text', text: results }],
      };
    } catch (error: any) {
      const isConnectionError =
        error.cause?.code === 'ECONNREFUSED' ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('fetch failed');

      if (isConnectionError) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Cannot connect to documentation API at ${API_BASE_URL}.`,
            },
          ],
          isError: true,
        };
      }

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

// ============================================================================
// START SERVER
// ============================================================================

async function main(): Promise<void> {
  // Check API availability (non-blocking warning)
  const apiAvailable = await checkApiHealth();
  if (!apiAvailable) {
    console.error(`⚠️  Warning: Cannot reach API at ${API_BASE_URL}`);
    console.error(`   Make sure the API server is running: npm run api`);
    console.error(`   Or set DODO_DOCS_API_URL environment variable\n`);
  }

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol)
  console.error('🚀 Dodo Docs MCP Server started');
  console.error(`   API: ${API_BASE_URL}`);
  console.error('   Transport: stdio');
  if (apiAvailable) {
    console.error('   Status: ✅ API connected');
  }
}

main().catch(error => {
  console.error('❌ Server error:', error);
  process.exit(1);
});
