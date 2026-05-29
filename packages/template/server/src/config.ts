/**
 * Server configuration, read from environment variables.
 *
 * Mirrors the Cloudflare worker's env contract so the same Pinecone index can
 * be served from either runtime.
 */

export interface ServerConfig {
  port: number;
  serverName: string;
  serverDescription: string;
  pineconeApiKey: string;
  pineconeIndexName: string;
  embeddingProvider: 'openai' | 'gemini' | 'cohere' | 'voyage' | 'ollama';
  embeddingModel: string;
  embeddingDimensions: number;
  openaiApiKey?: string;
  geminiApiKey?: string;
  cohereApiKey?: string;
  voyageApiKey?: string;
  ollamaBaseUrl: string;
  defaultTopK: number;
  maxTopK: number;
  enableRerank: boolean;
  rerankModel: string;
  rerankFetchCount: number;
  maxRerankChars: number;
}

function int(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isNaN(n) ? fallback : n;
}

/**
 * Build the server config from process.env, throwing on missing required vars.
 */
export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const pineconeApiKey = env.PINECONE_API_KEY;
  const pineconeIndexName = env.PINECONE_INDEX_NAME;

  const missing: string[] = [];
  if (!pineconeApiKey) missing.push('PINECONE_API_KEY');
  if (!pineconeIndexName) missing.push('PINECONE_INDEX_NAME');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    port: int(env.PORT, 8787),
    serverName: env.SERVER_NAME || 'contextmcp',
    serverDescription: env.SERVER_DESCRIPTION || 'Search documentation',
    pineconeApiKey: pineconeApiKey!,
    pineconeIndexName: pineconeIndexName!,
    embeddingProvider: (env.EMBEDDING_PROVIDER as ServerConfig['embeddingProvider']) || 'openai',
    embeddingModel: env.EMBEDDING_MODEL || 'text-embedding-3-large',
    embeddingDimensions: int(env.EMBEDDING_DIMENSIONS, 3072),
    openaiApiKey: env.OPENAI_API_KEY,
    geminiApiKey: env.GEMINI_API_KEY,
    cohereApiKey: env.COHERE_API_KEY,
    voyageApiKey: env.VOYAGE_API_KEY,
    ollamaBaseUrl: env.OLLAMA_BASE_URL || 'http://localhost:11434',
    defaultTopK: int(env.DEFAULT_TOP_K, 10),
    maxTopK: int(env.MAX_TOP_K, 20),
    enableRerank: env.ENABLE_RERANK !== 'false',
    rerankModel: env.RERANK_MODEL || 'pinecone-rerank-v0',
    rerankFetchCount: int(env.RERANK_FETCH_COUNT, 30),
    maxRerankChars: int(env.MAX_RERANK_CHARS, 1200),
  };
}
