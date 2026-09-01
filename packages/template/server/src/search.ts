/**
 * Documentation search — embeddings, Pinecone query, optional rerank.
 *
 * Ported from the Cloudflare worker so the Node server returns identical
 * results from the same Pinecone index.
 */

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import type { ServerConfig } from './config.js';
// Runtime-agnostic helpers shared with the Cloudflare worker. Vendored copy —
// see scripts/sync-shared.mjs and the drift test. Edit the canonical source at
// packages/template/src/search-core.ts, then `npm run sync:shared`.
import {
  type SearchResult,
  clampLimit,
  mapMatchToSearchResult,
  roundScore,
  formatResults,
} from './shared/search-core.js';

// Re-export the shared contract so existing importers (./search.js) are unchanged.
export { type SearchResult, clampLimit, formatResults };

/** Generate a query embedding using the configured provider. */
export async function generateQueryEmbedding(
  config: ServerConfig,
  query: string
): Promise<number[]> {
  switch (config.embeddingProvider) {
    case 'gemini': {
      const gemini = new GoogleGenAI({ apiKey: config.geminiApiKey });
      const res = await gemini.models.embedContent({
        model: config.embeddingModel,
        contents: [{ parts: [{ text: query }], role: 'user' }],
        config: {
          taskType: 'RETRIEVAL_QUERY' as const,
          outputDimensionality: config.embeddingDimensions,
        },
      });
      return res.embeddings?.[0]?.values ?? [];
    }
    case 'cohere': {
      const res = await fetch('https://api.cohere.com/v2/embed', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.cohereApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.embeddingModel,
          texts: [query],
          input_type: 'search_query',
          embedding_types: ['float'],
        }),
      });
      if (!res.ok) throw new Error(`Cohere embed failed: ${res.status}`);
      const data = (await res.json()) as { embeddings?: { float?: number[][] } };
      return data.embeddings?.float?.[0] ?? [];
    }
    case 'voyage': {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.voyageApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: config.embeddingModel, input: [query], input_type: 'query' }),
      });
      if (!res.ok) throw new Error(`Voyage embed failed: ${res.status}`);
      const data = (await res.json()) as { data?: { embedding: number[] }[] };
      return data.data?.[0]?.embedding ?? [];
    }
    case 'ollama': {
      const baseUrl = config.ollamaBaseUrl.replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.embeddingModel, input: [query] }),
      });
      if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
      const data = (await res.json()) as { embeddings?: number[][] };
      return data.embeddings?.[0] ?? [];
    }
    default: {
      const openai = new OpenAI({ apiKey: config.openaiApiKey });
      const res = await openai.embeddings.create({ model: config.embeddingModel, input: [query] });
      return res.data[0].embedding;
    }
  }
}

async function rerank(
  pinecone: Pinecone,
  query: string,
  docs: SearchResult[],
  topN: number,
  config: ServerConfig
): Promise<SearchResult[]> {
  try {
    const docsForRerank = docs.map((d, idx) => {
      const fullText = `${d.title} - ${d.heading}\n${d.content}`;
      const text =
        fullText.length > config.maxRerankChars
          ? fullText.slice(0, config.maxRerankChars) + '...'
          : fullText;
      return { id: String(idx), text };
    });

    const result = await pinecone.inference.rerank(config.rerankModel, query, docsForRerank, {
      topN,
      returnDocuments: false,
    });

    return result.data.map(r => ({
      ...docs[r.index],
      score: roundScore(r.score),
    }));
  } catch (error) {
    console.error('[Rerank] Failed:', error);
    return docs.slice(0, topN);
  }
}

/** Search the documentation index for a query. */
export async function searchDocs(
  pinecone: Pinecone,
  config: ServerConfig,
  query: string,
  limit?: number
): Promise<SearchResult[]> {
  const returnCount = clampLimit(limit, config.defaultTopK, config.maxTopK);
  const index = pinecone.index(config.pineconeIndexName);
  const queryEmbedding = await generateQueryEmbedding(config, query);
  const fetchCount = config.enableRerank ? config.rerankFetchCount : returnCount;

  const results = await index.query({
    vector: queryEmbedding,
    topK: fetchCount,
    includeMetadata: true,
  });

  const searchResults: SearchResult[] =
    results.matches?.map(match => mapMatchToSearchResult(match.score, match.metadata)) || [];

  if (searchResults.length > 0 && config.enableRerank) {
    return rerank(pinecone, query, searchResults, returnCount, config);
  }

  return searchResults.slice(0, returnCount);
}
