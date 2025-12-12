/**
 * Express API for semantic search over Dodo Payments docs
 *
 * GET /llms.txt?topic={topic} - Search for relevant documentation chunks
 */

import express from 'express';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import 'dotenv/config';
import {
  validateApiEnv,
  PINECONE_INDEX_NAME,
  DEFAULT_TOP_K,
  MAX_TOP_K,
  EMBEDDING_MODEL,
} from '../config/index.js';

// Config
const PORT = process.env.PORT || 3000;

// Validate required environment variables
validateApiEnv();

// Initialize clients (safe after validation)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

const app = express();

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Request logging middleware
 */
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Only log non-health endpoints to avoid noise
    if (req.path !== '/health') {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate query embedding using OpenAI
 */
async function generateQueryEmbedding(query: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: [query],
  });
  return response.data[0].embedding;
}

/**
 * Search Pinecone for relevant chunks
 */
async function searchDocs(query: string, topK: number = DEFAULT_TOP_K) {
  const index = pc.index(PINECONE_INDEX_NAME);
  const queryEmbedding = await generateQueryEmbedding(query);

  const results = await index.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });

  return (
    results.matches?.map(match => ({
      score: Math.round((match.score || 0) * 100) / 100,
      title: match.metadata?.documentTitle,
      category: match.metadata?.category,
      heading: match.metadata?.heading,
      content: match.metadata?.content,
      url: match.metadata?.sourceUrl,
      method: match.metadata?.method,
      path: match.metadata?.path,
      language: match.metadata?.language,
    })) || []
  );
}

/**
 * Parse and validate limit parameter
 */
function parseLimit(value: string | undefined): number {
  if (!value) return DEFAULT_TOP_K;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_TOP_K;
  return Math.min(parsed, MAX_TOP_K);
}

/**
 * Safely extract string query parameter
 */
function getStringParam(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Format search results as plain text
 */
function formatResults(
  results: ReturnType<typeof searchDocs> extends Promise<infer T> ? T : never,
  query: string,
  separator: string
): string {
  const lines: string[] = [
    '# Dodo Payments Documentation',
    `> Query: ${query}`,
    `> Results: ${results.length}`,
    '',
  ];

  results.forEach(result => {
    lines.push(separator);
    lines.push(`## ${result.title}`);
    if (result.url) lines.push(`Source: ${result.url}`);
    if (result.method && result.path) lines.push(`API: ${result.method} ${result.path}`);
    if (result.language) lines.push(`Language: ${result.language}`);
    lines.push('');
    lines.push(String(result.content || ''));
    lines.push('');
  });

  return lines.join('\n');
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /llms.txt?topic={topic}&limit={limit}
 * Search documentation and return plain text results
 */
app.get('/llms.txt', async (req, res) => {
  try {
    const topic = getStringParam(req.query.topic);
    const limit = parseLimit(getStringParam(req.query.limit));

    if (!topic) {
      res
        .status(400)
        .type('text/plain')
        .send(
          'Missing required parameter: topic\nUsage: GET /llms.txt?topic=your+search+query&limit=20'
        );
      return;
    }

    const results = await searchDocs(topic, limit);
    res.type('text/plain').send(formatResults(results, topic, '-'.repeat(40)));
  } catch (error: any) {
    console.error('❌ Search error:', error.message);
    res.status(500).type('text/plain').send(`Error: ${error.message}`);
  }
});

/**
 * Health check
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'dodo-knowledge-search' });
});

/**
 * Root - API info
 */
app.get('/', (_req, res) => {
  res.json({
    name: 'Dodo Payments Knowledge Search API',
    endpoints: {
      '/llms.txt': 'GET - Search docs (plain text response)',
      '/health': 'GET - Health check',
    },
    parameters: {
      topic: 'Search query (required)',
      limit: `Number of results (default: ${DEFAULT_TOP_K}, max: ${MAX_TOP_K})`,
    },
    example: '/llms.txt?topic=create+payment&limit=20',
  });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

const server = app.listen(PORT, () => {
  console.log(`🚀 Dodo Knowledge Search API running on http://localhost:${PORT}`);
  console.log(`\n   Try: http://localhost:${PORT}/llms.txt?topic=create+payment\n`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
