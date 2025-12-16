/**
 * Shared constants for embeddings and API
 */

// Embedding configuration
export const EMBEDDING_MODEL = 'text-embedding-3-large';
export const EMBEDDING_DIMENSION = 3072;
export const PINECONE_INDEX_NAME = 'dodo-knowledge-mcp';

// Batch processing
export const DEFAULT_BATCH_SIZE = 100;
export const DELAY_BETWEEN_BATCHES = 0;
export const MAX_RETRIES = 10;
export const QUOTA_WAIT_TIME = 30000; // 30 seconds

// Pinecone configuration
export const PINECONE_CLOUD = process.env.PINECONE_CLOUD || 'aws';
export const PINECONE_REGION = process.env.PINECONE_REGION || 'us-east-1';

// Content limits
export const PINECONE_METADATA_MAX_LENGTH = 8000;
export const MIN_MEANINGFUL_CONTENT_LENGTH = 50;

// API defaults
export const DEFAULT_TOP_K = 10;
export const MAX_TOP_K = 50;
