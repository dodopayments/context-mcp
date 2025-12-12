/**
 * Unified Embedding Generator
 * 
 * Generates embeddings for documentation and uploads to Pinecone.
 * Supports multiple index types via CLI argument.
 * 
 * Usage:
 *   npm run embed           # Embed docs-index.json
 *   npm run embed:sdk       # Embed sdk-index.json
 *   npm run embed:billingsdk # Embed billingsdk-index.json
 *   
 *   # Or directly:
 *   npx tsx src/embeddings/embed.ts docs
 *   npx tsx src/embeddings/embed.ts sdk
 *   npx tsx src/embeddings/embed.ts billingsdk
 */

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { DocChunk } from '../types/index.js';
import { 
  validateEmbeddingEnv, 
  PINECONE_INDEX_NAME, 
  DEFAULT_BATCH_SIZE, 
  DELAY_BETWEEN_BATCHES, 
  MAX_RETRIES, 
  QUOTA_WAIT_TIME 
} from '../config/index.js';
import { 
  generateEmbeddings, 
  initPineconeIndex, 
  chunkToRecord, 
  prepareChunkForEmbedding,
  sleep,
  generateQueryEmbedding,
} from './core.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');

type IndexType = 'docs' | 'sdk' | 'billingsdk';

interface IndexConfig {
  file: string;
  name: string;
  prepareChunk: (chunk: DocChunk) => string;
  testQueries: string[];
}

const INDEX_CONFIGS: Record<IndexType, IndexConfig> = {
  docs: {
    file: 'docs-index.json',
    name: 'Documentation',
    prepareChunk: prepareChunkForEmbedding,
    testQueries: ['how to create a payment', 'webhook signature verification'],
  },
  sdk: {
    file: 'sdk-index.json',
    name: 'SDK',
    prepareChunk: (chunk) => {
      const parts: string[] = [];
      if (chunk.metadata.repository) parts.push(`SDK: ${chunk.metadata.repository}`);
      if (chunk.metadata.language) parts.push(`Language: ${chunk.metadata.language}`);
      parts.push(chunk.documentTitle);
      if (chunk.heading && chunk.heading !== chunk.documentTitle) parts.push(chunk.heading);
      if (chunk.metadata.description) parts.push(chunk.metadata.description);
      parts.push(chunk.content);
      return parts.join('\n\n');
    },
    testQueries: ['create payment typescript', 'list customers python'],
  },
  billingsdk: {
    file: 'billingsdk-index.json',
    name: 'BillingSDK',
    prepareChunk: (chunk) => {
      const parts: string[] = [
        'BillingSDK - React billing components for Dodo Payments',
      ];
      if (chunk.metadata.repository) parts.push(`Repository: ${chunk.metadata.repository}`);
      parts.push(`Document: ${chunk.documentTitle}`);
      parts.push(chunk.heading);
      if (chunk.metadata.description) parts.push(chunk.metadata.description);
      parts.push(chunk.content);
      return parts.join('\n\n');
    },
    testQueries: ['pricing table component', 'billingsdk installation'],
  },
};

// =============================================================================
// MAIN LOGIC
// =============================================================================

interface AnyIndex {
  generatedAt: string;
  chunks: DocChunk[];
  totalChunks?: number;
  repositories?: { repo: string; language: string; files: number; chunks: number }[];
  categories?: string[];
}

function loadIndex(indexType: IndexType): AnyIndex {
  const config = INDEX_CONFIGS[indexType];
  const filePath = path.join(DATA_DIR, config.file);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    console.error(`   Run the corresponding parse command first.`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as AnyIndex;
}

async function embed(indexType: IndexType): Promise<void> {
  const config = INDEX_CONFIGS[indexType];
  
  console.log(`🚀 ${config.name} Embedding Generator\n`);
  console.log('='.repeat(50));
  
  // Validate environment
  validateEmbeddingEnv();
  
  // Initialize clients
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  
  // Load index
  console.log(`\n📚 Loading ${config.name} index...`);
  const index = loadIndex(indexType);
  
  console.log(`   Generated at: ${index.generatedAt}`);
  console.log(`   Total chunks: ${index.chunks.length}`);
  
  if (index.repositories) {
    console.log('\n   Repositories:');
    index.repositories.forEach(r => {
      console.log(`     • ${r.repo} (${r.language}): ${r.chunks} chunks`);
    });
  }
  
  if (index.categories) {
    console.log(`   Categories: ${index.categories.length}`);
  }
  
  const chunks = index.chunks;
  
  // Initialize Pinecone index
  await initPineconeIndex(pc);
  const pineconeIndex = pc.index(PINECONE_INDEX_NAME);
  
  // Process chunks in batches
  console.log('\n🔄 Generating embeddings and uploading...\n');
  
  let processed = 0;
  let failed = 0;
  
  for (let i = 0; i < chunks.length; i += DEFAULT_BATCH_SIZE) {
    const batch = chunks.slice(i, i + DEFAULT_BATCH_SIZE);
    const batchNum = Math.floor(i / DEFAULT_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(chunks.length / DEFAULT_BATCH_SIZE);
    
    process.stdout.write(`   Batch ${batchNum}/${totalBatches}: `);
    
    const texts = batch.map(config.prepareChunk);
    
    try {
      let embeddings: number[][] | null = null;
      
      for (let retry = 0; retry < MAX_RETRIES; retry++) {
        try {
          embeddings = await generateEmbeddings(openai, texts);
          break;
        } catch (err: any) {
          const isRateLimited = err.status === 429 || 
            err.message?.includes('429') || 
            err.message?.includes('rate') ||
            err.message?.includes('RESOURCE_EXHAUSTED');
          
          if (isRateLimited && retry < MAX_RETRIES - 1) {
            console.log(`\n   ⏳ Rate limited, waiting ${QUOTA_WAIT_TIME/1000}s (retry ${retry + 1}/${MAX_RETRIES})...`);
            await sleep(QUOTA_WAIT_TIME);
            process.stdout.write(`   Batch ${batchNum}/${totalBatches}: `);
          } else if (retry < MAX_RETRIES - 1) {
            const waitTime = (retry + 1) * 5000;
            console.log(`\n   ⚠️ Error: ${err.message}, waiting ${waitTime/1000}s...`);
            await sleep(waitTime);
            process.stdout.write(`   Batch ${batchNum}/${totalBatches}: `);
          } else {
            throw err;
          }
        }
      }
      
      if (!embeddings) throw new Error('Failed to generate embeddings');
      
      const records = batch.map((chunk, idx) => chunkToRecord(chunk, embeddings![idx]));
      await pineconeIndex.upsert(records);
      
      processed += batch.length;
      console.log(`✅ ${processed}/${chunks.length}`);
      
      if (i + DEFAULT_BATCH_SIZE < chunks.length) {
        await sleep(DELAY_BETWEEN_BATCHES);
      }
    } catch (error: any) {
      console.log(`❌ Failed: ${error.message}`);
      failed += batch.length;
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('✨ Embedding complete!\n');
  console.log('📊 Summary:');
  console.log(`   • Chunks processed: ${processed}`);
  console.log(`   • Chunks failed: ${failed}`);
  console.log(`   • Pinecone index: ${PINECONE_INDEX_NAME}`);
  
  // Test queries
  if (processed > 0 && config.testQueries.length > 0) {
    console.log('\n🔍 Testing with sample queries...\n');
    
    for (const testQuery of config.testQueries) {
      const queryEmbedding = await generateQueryEmbedding(openai, testQuery);
      
      const results = await pineconeIndex.query({
        vector: queryEmbedding,
        topK: 3,
        includeMetadata: true,
      });
      
      console.log(`Query: "${testQuery}"`);
      results.matches?.forEach((match, idx) => {
        console.log(`   ${idx + 1}. [${(match.score! * 100).toFixed(1)}%] ${match.metadata?.heading}`);
        if (match.metadata?.repository) {
          console.log(`      ${match.metadata.repository} (${match.metadata.language})`);
        } else if (match.metadata?.category) {
          console.log(`      Category: ${match.metadata.category}`);
        }
      });
      console.log();
    }
  }
}

// =============================================================================
// CLI
// =============================================================================

function printUsage(): void {
  console.log('Usage: npx tsx src/embeddings/embed.ts <type>');
  console.log('');
  console.log('Types:');
  console.log('  docs       - Embed documentation (docs-index.json)');
  console.log('  sdk        - Embed SDK docs (sdk-index.json)');
  console.log('  billingsdk - Embed BillingSDK docs (billingsdk-index.json)');
  console.log('');
  console.log('Or use npm scripts:');
  console.log('  npm run embed           # docs');
  console.log('  npm run embed:sdk       # sdk');
  console.log('  npm run embed:billingsdk # billingsdk');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    // Default to 'docs' if no argument
    if (args.length === 0) {
      await embed('docs');
    } else {
      printUsage();
    }
    return;
  }
  
  const indexType = args[0] as IndexType;
  
  if (!INDEX_CONFIGS[indexType]) {
    console.error(`❌ Unknown index type: ${indexType}`);
    console.error('');
    printUsage();
    process.exit(1);
  }
  
  await embed(indexType);
}

main().catch(console.error);
