/**
 * Clean Vectors Script
 *
 * Removes all vectors from Pinecone index.
 * Use before manual re-embedding or to reset the index.
 *
 * Usage: npm run clean:vectors
 */

import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';
import { clearPineconeIndex, initPineconeIndex, getPineconeStats } from '../src/embeddings/core.js';
import { loadConfig } from '../src/config/loader.js';

async function main() {
  console.log('🗑️  Pinecone Vector Cleanup\n');
  console.log('═'.repeat(50));

  // Load configuration
  const config = loadConfig();

  // Validate environment
  if (!process.env.PINECONE_API_KEY) {
    console.error('❌ PINECONE_API_KEY not set');
    console.error('   Create a .env file or set the environment variable.');
    process.exit(1);
  }

  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

  // Ensure index exists
  const indexName = config.vectordb.indexName;
  console.log(`\n📊 Index: ${indexName}`);
  const pineconeConfig = config.vectordb.pinecone;
  await initPineconeIndex(
    pc,
    indexName,
    config.embeddings.dimensions,
    pineconeConfig?.cloud || 'aws',
    pineconeConfig?.region || 'us-east-1'
  );

  // Get current stats
  const beforeStats = await getPineconeStats(pc, indexName);
  console.log(`   Current vectors: ${beforeStats.vectorCount.toLocaleString()}`);
  console.log(`   Dimension: ${beforeStats.dimension}`);

  if (beforeStats.vectorCount === 0) {
    console.log('\n✅ Index is already empty. Nothing to clean.');
    return;
  }

  // Confirm deletion
  console.log('\n⚠️  This will delete ALL vectors from the index.');
  console.log('   This action cannot be undone.\n');

  // Clear the index
  console.log('🔄 Clearing vectors...');
  const result = await clearPineconeIndex(pc, indexName);

  if (result.success) {
    console.log(`\n✅ Successfully deleted ${result.vectorCount?.toLocaleString() || 0} vectors`);
    
    // Verify
    const afterStats = await getPineconeStats(pc, indexName);
    console.log(`   Remaining vectors: ${afterStats.vectorCount.toLocaleString()}`);
  } else {
    console.error('\n❌ Failed to clear vectors');
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(50));
  console.log('✅ Cleanup complete!');
  console.log('   Run "npm run reindex" to repopulate the index.');
  console.log('═'.repeat(50) + '\n');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

