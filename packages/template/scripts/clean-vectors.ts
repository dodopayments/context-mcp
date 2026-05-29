/**
 * Clean Vectors Script
 *
 * Removes all vectors from the configured vector store (Pinecone, Qdrant, ...).
 * Use before manual re-embedding or to reset the index.
 *
 * Usage: npm run clean:vectors
 */

import 'dotenv/config';
import { createVectorStore } from '../src/vectorstore/index.js';
import { loadConfig } from '../src/config/loader.js';

async function main() {
  console.log('🗑️  Vector Store Cleanup\n');
  console.log('═'.repeat(50));

  // Load configuration
  const config = loadConfig();

  // Build the configured vector store (validates required env vars internally).
  const store = createVectorStore(config);
  const indexName = config.vectordb.indexName;
  console.log(`\n📊 Provider: ${store.provider}`);
  console.log(`   Index/collection: ${indexName}`);

  // Ensure the index/collection exists before inspecting it.
  await store.ensureIndex({ dimension: config.embeddings.dimensions });

  // Get current stats
  const beforeStats = await store.stats();
  console.log(`   Current vectors: ${beforeStats.vectorCount.toLocaleString()}`);
  if (beforeStats.dimension) console.log(`   Dimension: ${beforeStats.dimension}`);

  if (beforeStats.vectorCount === 0) {
    console.log('\n✅ Index is already empty. Nothing to clean.');
    return;
  }

  // Confirm deletion
  console.log('\n⚠️  This will delete ALL vectors from the index.');
  console.log('   This action cannot be undone.\n');

  // Clear the index
  console.log('🔄 Clearing vectors...');
  const result = await store.clear();

  if (result.success) {
    console.log(`\n✅ Successfully deleted ${result.vectorCount?.toLocaleString() || 0} vectors`);

    // Verify
    const afterStats = await store.stats();
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

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
