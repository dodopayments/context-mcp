/**
 * Configuration barrel export
 * 
 * Centralizes all constants, configuration, and environment utilities.
 */

export {
  // Embedding
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSION,
  
  // Pinecone
  PINECONE_INDEX_NAME,
  PINECONE_CLOUD,
  PINECONE_REGION,
  PINECONE_METADATA_MAX_LENGTH,
  
  // Batch processing
  DEFAULT_BATCH_SIZE,
  DELAY_BETWEEN_BATCHES,
  MAX_RETRIES,
  QUOTA_WAIT_TIME,
  
  // Content limits
  MIN_MEANINGFUL_CONTENT_LENGTH,
  
  // API defaults
  DEFAULT_TOP_K,
  MAX_TOP_K,
} from './constants.js';

export {
  validateEnv,
  validateEmbeddingEnv,
  validateApiEnv,
} from './env.js';
