/**
 * Shared Pinecone utilities for embedding operations
 */

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSION,
  PINECONE_INDEX_NAME,
  PINECONE_CLOUD,
  PINECONE_REGION,
  PINECONE_METADATA_MAX_LENGTH,
} from '../config/index.js';
import { DocChunk } from '../types/index.js';


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

/**
 * Generate embeddings for a batch of texts using OpenAI
 */
export async function generateEmbeddings(
  openai: OpenAI,
  texts: string[]
): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data.map(e => e.embedding);
}

/**
 * Generate embedding for a single query
 */
export async function generateQueryEmbedding(
  openai: OpenAI,
  query: string
): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: [query],
  });
  return response.data[0].embedding;
}

// =============================================================================
// PINECONE FUNCTIONS
// =============================================================================

/**
 * Initialize Pinecone index, creating if it doesn't exist
 */
export async function initPineconeIndex(pc: Pinecone): Promise<void> {
  const indexes = await pc.listIndexes();
  const indexExists = indexes.indexes?.some(i => i.name === PINECONE_INDEX_NAME);
  
  if (!indexExists) {
    console.log(`📦 Creating Pinecone index: ${PINECONE_INDEX_NAME}`);
    await pc.createIndex({
      name: PINECONE_INDEX_NAME,
      dimension: EMBEDDING_DIMENSION,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: PINECONE_CLOUD as 'aws' | 'gcp' | 'azure',
          region: PINECONE_REGION,
        },
      },
    });
    
    console.log('⏳ Waiting for index to be ready...');
    let ready = false;
    while (!ready) {
      const description = await pc.describeIndex(PINECONE_INDEX_NAME);
      ready = description.status?.ready ?? false;
      if (!ready) {
        await sleep(2000);
        process.stdout.write('.');
      }
    }
    console.log('\n✅ Index ready!');
  } else {
    console.log(`✅ Using existing index: ${PINECONE_INDEX_NAME}`);
  }
}

/**
 * Clear all vectors from Pinecone index
 * Use before full reindex to remove stale vectors
 */
export async function clearPineconeIndex(pc: Pinecone): Promise<{ success: boolean; vectorCount?: number }> {
  try {
    const index = pc.index(PINECONE_INDEX_NAME);
    
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
 */
export async function getPineconeStats(pc: Pinecone): Promise<{ vectorCount: number; dimension: number }> {
  const index = pc.index(PINECONE_INDEX_NAME);
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
export function truncateContent(content: string, maxLength: number = PINECONE_METADATA_MAX_LENGTH): string {
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
  return parts.join('\n\n');
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
