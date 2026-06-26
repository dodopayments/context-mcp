/**
 * Shared Pinecone utilities for embedding operations
 */

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { get_encoding } from 'tiktoken';
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSION,
  PINECONE_CLOUD,
  PINECONE_REGION,
  PINECONE_METADATA_MAX_LENGTH,
  EMBEDDING_MAX_TOKENS,
  EMBEDDING_ENCODING,
} from '../config/index.js';
import { DocChunk } from '../types/index.js';

// cl100k_base approximates both OpenAI and Gemini tokenization (~8192 token limit each)
const encoder = get_encoding(EMBEDDING_ENCODING);

// =============================================================================
// TYPES
// =============================================================================

export interface EmbeddingRecord {
  id: string;
  values: number[];
  metadata: {
    documentPath: string;
    documentTitle: string;
    category: string;
    heading: string;
    content: string;
    sourceUrl?: string;
    repository?: string;
    language?: string;
    method?: string;
    path?: string;
    apiPath?: string;
    version?: string;
  };
}

// =============================================================================
// EMBEDDING FUNCTIONS
// =============================================================================

// Only text-embedding-3+ accept the `dimensions` param; older models (ada-002)
// reject it with a 400, so it must be omitted for them.
export function openAISupportsDimensions(model: string): boolean {
  return model.startsWith('text-embedding-3');
}

/**
 * Guard against a provider returning a different number of embeddings than the
 * number of inputs. The reindex pipeline maps `embeddings[idx]` onto the chunk
 * at the same position, so a length mismatch silently assigns `undefined`
 * (or the wrong) vectors to documents and corrupts the index. Fail loud instead.
 */
export function assertEmbeddingCount(label: string, embeddings: unknown[], expected: number): void {
  if (embeddings.length !== expected) {
    throw new Error(`${label}: expected ${expected} embeddings but received ${embeddings.length}`);
  }
  for (let i = 0; i < embeddings.length; i++) {
    const v = embeddings[i];
    if (!Array.isArray(v) || v.length === 0) {
      throw new Error(`${label}: embedding at index ${i} is missing or empty`);
    }
  }
}

/**
 * Some providers (e.g. Voyage) return results with an explicit `index` and do
 * not guarantee input order. Reassemble into input order so each embedding is
 * matched to the correct document. Falls back to response order if indexes are
 * absent.
 */
export function reorderByIndex(
  label: string,
  items: { embedding: number[]; index?: number }[],
  expected: number
): number[][] {
  const hasIndexes = items.some(it => typeof it.index === 'number');
  if (!hasIndexes) return items.map(it => it.embedding);

  const out: number[][] = new Array(expected);
  for (const it of items) {
    const idx = it.index;
    if (typeof idx !== 'number' || idx < 0 || idx >= expected) {
      throw new Error(`${label}: response index ${String(idx)} is out of range`);
    }
    if (out[idx] !== undefined) {
      throw new Error(`${label}: duplicate response index ${idx}`);
    }
    out[idx] = it.embedding;
  }
  return out;
}

/**
 * Generate embeddings for a batch of texts using OpenAI.
 */
export async function generateEmbeddingsOpenAI(
  openai: OpenAI,
  texts: string[],
  model: string,
  dimensions?: number
): Promise<number[][]> {
  const useDimensions = dimensions !== undefined && openAISupportsDimensions(model);
  return withRetry(
    () =>
      openai.embeddings
        .create({ model, input: texts, ...(useDimensions ? { dimensions } : {}) })
        .then(response => response.data.map(e => e.embedding)),
    { label: 'OpenAI embeddings' }
  );
}

/**
 * Generate embeddings for a batch of document texts using Gemini.
 * Retries on 429 rate-limit errors with exponential backoff.
 */
export async function generateEmbeddingsGemini(
  gemini: GoogleGenAI,
  model: string,
  texts: string[],
  dimensions: number
): Promise<number[][]> {
  return withRetry(
    () =>
      gemini.models
        .embedContent({
          model,
          contents: texts.map(t => ({ parts: [{ text: t }], role: 'user' })),
          config: {
            taskType: 'RETRIEVAL_DOCUMENT' as const,
            outputDimensionality: dimensions,
          },
        })
        .then(response => (response.embeddings ?? []).map(e => e.values ?? [])),
    { label: 'Gemini embeddings' }
  );
}

/**
 * Generate embeddings for a batch of texts using Cohere's Embed API.
 * Uses the REST API directly (no SDK dependency) and the shared retry policy.
 *
 * @see https://docs.cohere.com/reference/embed
 */
export async function generateEmbeddingsCohere(
  apiKey: string,
  model: string,
  texts: string[],
  dimensions?: number
): Promise<number[][]> {
  return withRetry(
    async () => {
      const res = await fetch('https://api.cohere.com/v2/embed', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          texts,
          input_type: 'search_document',
          embedding_types: ['float'],
          // Without this, embed-v4.0 returns its 1536-dim default, which won't
          // match a Pinecone index created at the configured dimension.
          ...(dimensions ? { output_dimension: dimensions } : {}),
        }),
      });
      if (!res.ok) {
        throw Object.assign(new Error(`Cohere embed failed: ${res.status} ${res.statusText}`), {
          status: res.status,
          headers: res.headers,
        });
      }
      const data = (await res.json()) as { embeddings?: { float?: number[][] } };
      const out = data.embeddings?.float;
      if (!out) throw new Error('Cohere embed: unexpected response shape (no embeddings.float)');
      assertEmbeddingCount('Cohere embed', out, texts.length);
      return out;
    },
    { label: 'Cohere embed' }
  );
}

/**
 * Generate embeddings for a batch of texts using Voyage AI's embeddings API.
 * Uses the REST API directly (no SDK dependency) and the shared retry policy.
 *
 * @see https://docs.voyageai.com/reference/embeddings-api
 */
export async function generateEmbeddingsVoyage(
  apiKey: string,
  model: string,
  texts: string[],
  dimensions?: number
): Promise<number[][]> {
  return withRetry(
    async () => {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: texts,
          input_type: 'document',
          // voyage-3-large / voyage-code-3 support Matryoshka output_dimension;
          // pin it so vectors match the configured Pinecone index dimension.
          ...(dimensions ? { output_dimension: dimensions } : {}),
        }),
      });
      if (!res.ok) {
        throw Object.assign(new Error(`Voyage embed failed: ${res.status} ${res.statusText}`), {
          status: res.status,
          headers: res.headers,
        });
      }
      const data = (await res.json()) as {
        data?: { embedding: number[]; index?: number }[];
      };
      if (!data.data) throw new Error('Voyage embed: unexpected response shape (no data)');
      const out = reorderByIndex('Voyage embed', data.data, texts.length);
      assertEmbeddingCount('Voyage embed', out, texts.length);
      return out;
    },
    { label: 'Voyage embed' }
  );
}

/**
 * Generate embeddings for a batch of texts using a local Ollama server.
 * No API key required; runs fully offline against the configured base URL.
 *
 * @param baseUrl - Ollama server URL, e.g. http://localhost:11434
 * @see https://github.com/ollama/ollama/blob/main/docs/api.md#generate-embeddings
 */
export async function generateEmbeddingsOllama(
  baseUrl: string,
  model: string,
  texts: string[]
): Promise<number[][]> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/embed`;
  return withRetry(
    async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Ollama's /api/embed accepts a string or string[] in `input`.
        body: JSON.stringify({ model, input: texts }),
      });
      if (!res.ok) {
        throw Object.assign(new Error(`Ollama embed failed: ${res.status} ${res.statusText}`), {
          status: res.status,
          headers: res.headers,
        });
      }
      const data = (await res.json()) as { embeddings?: number[][] };
      if (!data.embeddings) {
        throw new Error('Ollama embed: unexpected response shape (no embeddings)');
      }
      assertEmbeddingCount('Ollama embed', data.embeddings, texts.length);
      return data.embeddings;
    },
    { label: 'Ollama embed' }
  );
}
// =============================================================================
// PINECONE FUNCTIONS
// =============================================================================

/**
 * Initialize Pinecone index, creating if it doesn't exist
 * @param pc - Pinecone client
 * @param indexName - Name of the index (from config)
 * @param dimension - Embedding dimension (from config)
 * @param cloud - Pinecone cloud provider (from config)
 * @param region - Pinecone region (from config)
 */
export async function initPineconeIndex(
  pc: Pinecone,
  indexName: string,
  dimension: number = EMBEDDING_DIMENSION,
  cloud: string = PINECONE_CLOUD,
  region: string = PINECONE_REGION
): Promise<void> {
  const indexes = await pc.listIndexes();
  const indexExists = indexes.indexes?.some(i => i.name === indexName);

  if (!indexExists) {
    console.log(`📦 Creating Pinecone index: ${indexName}`);
    await pc.createIndex({
      name: indexName,
      dimension: dimension,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: cloud as 'aws' | 'gcp' | 'azure',
          region: region,
        },
      },
    });

    console.log('⏳ Waiting for index to be ready...');
    let ready = false;
    while (!ready) {
      const description = await pc.describeIndex(indexName);
      ready = description.status?.ready ?? false;
      if (!ready) {
        await sleep(2000);
        process.stdout.write('.');
      }
    }
    console.log('\n✅ Index ready!');
  } else {
    console.log(`✅ Using existing index: ${indexName}`);
  }
}

/**
 * Clear all vectors from Pinecone index
 * Use before full reindex to remove stale vectors
 * @param pc - Pinecone client
 * @param indexName - Name of the index (from config)
 */
export async function clearPineconeIndex(
  pc: Pinecone,
  indexName: string
): Promise<{ success: boolean; vectorCount?: number }> {
  try {
    const index = pc.index(indexName);

    // Get current stats before clearing
    const stats = await index.describeIndexStats();
    const vectorCount = stats.totalRecordCount || 0;

    if (vectorCount === 0) {
      console.log('   Index is already empty');
      return { success: true, vectorCount: 0 };
    }

    console.log(`   Found ${vectorCount.toLocaleString()} vectors to delete...`);

    // Delete all vectors in the default namespace
    await index.namespace('').deleteAll();

    // Wait a moment for deletion to propagate
    await sleep(2000);

    // Verify deletion
    const newStats = await index.describeIndexStats();
    const remaining = newStats.totalRecordCount || 0;

    if (remaining > 0) {
      console.log(`   ⚠️ ${remaining} vectors still remaining (may take time to propagate)`);
    }

    return { success: true, vectorCount };
  } catch (error) {
    console.error('   Error clearing index:', error);
    return { success: false };
  }
}

/**
 * Get current index statistics
 * @param pc - Pinecone client
 * @param indexName - Name of the index (from config)
 */
export async function getPineconeStats(
  pc: Pinecone,
  indexName: string
): Promise<{ vectorCount: number; dimension: number }> {
  const index = pc.index(indexName);
  const stats = await index.describeIndexStats();
  return {
    vectorCount: stats.totalRecordCount || 0,
    dimension: stats.dimension || EMBEDDING_DIMENSION,
  };
}

// =============================================================================
// CONTENT UTILITIES
// =============================================================================

/**
 * Truncate content for metadata storage (Pinecone has limits)
 */
export function truncateContent(
  content: string,
  maxLength: number = PINECONE_METADATA_MAX_LENGTH
): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '...';
}

/**
 * Convert chunk to Pinecone record format
 */
export function chunkToRecord(chunk: DocChunk, embedding: number[]): EmbeddingRecord {
  return {
    id: chunk.id.replace(/[^a-zA-Z0-9_-]/g, '_'),
    values: embedding,
    metadata: {
      documentPath: chunk.documentPath,
      documentTitle: chunk.documentTitle,
      category: chunk.category,
      heading: chunk.heading,
      content: truncateContent(chunk.content),
      sourceUrl: chunk.metadata.sourceUrl,
      repository: chunk.metadata.repository,
      language: chunk.metadata.language,
      method: chunk.metadata.method,
      path: chunk.metadata.path,
      version: chunk.metadata.version,
    },
  };
}

/**
 * Prepare chunk for embedding - combine fields for better semantic search
 */
export function prepareChunkForEmbedding(chunk: DocChunk): string {
  const parts: string[] = [];

  // Add repository context
  if (chunk.metadata.repository) {
    parts.push(`SDK: ${chunk.metadata.repository}`);
  }

  // Add language
  if (chunk.metadata.language) {
    parts.push(`Language: ${chunk.metadata.language}`);
  }

  // Add title/heading
  parts.push(chunk.documentTitle);
  if (chunk.heading && chunk.heading !== chunk.documentTitle) {
    parts.push(chunk.heading);
  }

  // Add API method context
  if (chunk.metadata.method && chunk.metadata.path) {
    parts.push(`${chunk.metadata.method.toUpperCase()} ${chunk.metadata.path}`);
  }

  // Add description
  if (chunk.metadata.description) {
    parts.push(chunk.metadata.description);
  }

  // Add the main content
  parts.push(chunk.content);
  const embeddingInput = parts.join('\n\n');

  const tokens = encoder.encode(embeddingInput);
  if (tokens.length <= EMBEDDING_MAX_TOKENS) return embeddingInput;
  const truncatedTokens = tokens.slice(0, EMBEDDING_MAX_TOKENS);
  return new TextDecoder().decode(encoder.decode(truncatedTokens));
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Network error codes that are safe to retry (transient connectivity issues).
// Note: ENOTFOUND (hard NXDOMAIN) is intentionally excluded — it's almost
// always a permanent misconfiguration, so retrying only adds latency. The
// transient DNS failure worth retrying is EAI_AGAIN.
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/**
 * Extract an HTTP status code from a variety of error shapes
 * (OpenAI/Gemini SDK errors, fetch Response-like errors, plain objects).
 */
function getErrorStatus(err: unknown): number | undefined {
  const e = err as { status?: number; statusCode?: number; response?: { status?: number } };
  return e?.status ?? e?.statusCode ?? e?.response?.status;
}

/**
 * Extract a network error code (e.g. ECONNRESET) from an error or its cause.
 */
function getErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

/**
 * Decide whether an error is worth retrying: rate limits (429), transient
 * server errors (5xx), request timeouts (408), and network-level failures.
 */
export function isRetryableError(err: unknown): boolean {
  const status = getErrorStatus(err);
  if (status === 429 || status === 408) return true;
  if (status !== undefined && status >= 500 && status <= 599) return true;

  const code = getErrorCode(err);
  if (code && RETRYABLE_NETWORK_CODES.has(code)) return true;

  // Defense-in-depth: a bare timeout/abort can reach here as an AbortError
  // (DOMException, numeric code 20) if it wasn't translated to a TimeoutError.
  // Treat it as a transient timeout rather than a permanent failure.
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return true;
  }

  return false;
}

/**
 * Retry predicate for Pinecone upsert. The SDK already retries 5xx internally,
 * but not connection-level failures (PineconeConnectionError) — the transient
 * blip worth retrying during a long reindex. Matched by name since the SDK
 * doesn't export the class. Falls back to isRetryableError for raw errors.
 */
export function isRetryableUpsertError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'PineconeConnectionError') return true;
  return isRetryableError(err);
}

/**
 * Honour a Retry-After header (seconds or HTTP-date) if present on the error.
 * Returns a delay in ms, or undefined if not present/parseable.
 */
export function retryAfterMs(err: unknown): number | undefined {
  const headers = (err as { headers?: Record<string, string> | Headers })?.headers;
  if (!headers) return undefined;
  const raw =
    typeof (headers as Headers).get === 'function'
      ? (headers as Headers).get('retry-after')
      : (headers as Record<string, string>)['retry-after'];
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;

  // Numeric form: delta-seconds. Use a strict check so whitespace/empty
  // strings (which `Number()` coerces to 0) don't yield a bogus 0ms delay.
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;

  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());

  return undefined;
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Custom predicate; defaults to isRetryableError. */
  shouldRetry?: (err: unknown) => boolean;
  /** Label used in log output. */
  label?: string;
}

/**
 * Retry an async operation with exponential backoff + jitter.
 *
 * Retries on rate limits (429), request timeout (408), transient server
 * errors (5xx) and network failures (ECONNRESET, ETIMEDOUT, ...). Honours a
 * Retry-After header when the server provides one.
 *
 * Backwards compatible: still callable as withRetry(fn, maxAttempts, baseDelayMs).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  optionsOrMaxAttempts: number | RetryOptions = {},
  baseDelayMsArg = 2000
): Promise<T> {
  const options: RetryOptions =
    typeof optionsOrMaxAttempts === 'number'
      ? { maxAttempts: optionsOrMaxAttempts, baseDelayMs: baseDelayMsArg }
      : optionsOrMaxAttempts;

  // Sanitise maxAttempts: a non-positive / non-finite value (e.g. 0, -1, NaN
  // from bad config or an unparsed env var) must never short-circuit the loop
  // and throw a bogus "exhausted attempts" without ever running the operation.
  // Always make at least one attempt.
  const rawMaxAttempts = options.maxAttempts ?? 5;
  const maxAttempts =
    Number.isFinite(rawMaxAttempts) && rawMaxAttempts >= 1 ? Math.floor(rawMaxAttempts) : 1;
  const baseDelayMs = options.baseDelayMs ?? 2000;
  const maxDelayMs = options.maxDelayMs ?? 60000;
  const shouldRetry = options.shouldRetry ?? isRetryableError;
  const label = options.label ?? 'Request';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (!shouldRetry(err) || attempt === maxAttempts) throw err;

      // Prefer server-provided Retry-After, else exponential backoff with jitter.
      // Either way the delay is clamped to maxDelayMs: a hostile or buggy server
      // can legally send `Retry-After: 86400` (24h), and we must not hang the
      // whole indexing run on it.
      const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const jitter = Math.floor(Math.random() * Math.min(1000, backoff));
      const serverDelay = retryAfterMs(err);
      const delay =
        serverDelay !== undefined ? Math.min(serverDelay, maxDelayMs) : backoff + jitter;

      const reason = getErrorStatus(err) ?? getErrorCode(err) ?? 'error';
      console.log(
        `\n   ⏳ ${label} failed (${reason}), retrying in ${(delay / 1000).toFixed(1)}s ` +
          `(attempt ${attempt}/${maxAttempts})...`
      );
      await sleep(delay);
    }
  }
  // unreachable, but satisfies TypeScript
  throw new Error('withRetry: exhausted attempts');
}
