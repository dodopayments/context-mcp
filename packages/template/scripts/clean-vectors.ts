/**
 * Clean Vectors Script
 *
 * Removes all vectors from the configured vector store (Pinecone, Qdrant, ...).
 * Use before manual re-embedding or to reset the index.
 *
 * Usage:
 *   npx tsx scripts/clean-vectors.ts                 # Prompts for confirmation
 *   npx tsx scripts/clean-vectors.ts --force         # Skip confirmation (for CI)
 *   npx tsx scripts/clean-vectors.ts --config p.yaml # Use a custom config file
 */

import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createVectorStore } from '../src/vectorstore/index.js';
import { loadConfig } from '../src/config/loader.js';
import { parseCleanArgs, resolveDeletion, isAbortError } from '../src/config/clean-vectors-cli.js';

function parseArgs() {
  return parseCleanArgs(process.argv.slice(2));
}

function printHelp(): void {
  console.log(`
ContextMCP Clean Vectors Script

Removes ALL vectors from the configured Pinecone index. This cannot be undone.

Usage:
  npx tsx scripts/clean-vectors.ts [options]

Options:
  --help, -h             Show this help message
  --force, -f            Skip the interactive confirmation prompt
  --config, -c <path>    Use a custom config file path

Examples:
  npx tsx scripts/clean-vectors.ts                 # Prompt before deleting
  npx tsx scripts/clean-vectors.ts --force         # Delete without confirmation (CI)
  npx tsx scripts/clean-vectors.ts --config ci.yaml
`);
}

/**
 * Ask the user to confirm a destructive action by re-typing the index name.
 * Returns true only on an exact match. Aborts (false) on EOF / non-interactive
 * stdin so the script never deletes silently without --force.
 *
 * The actual decision is delegated to the pure `resolveDeletion` helper.
 */
async function confirmDeletion(indexName: string, vectorCount: number): Promise<boolean> {
  if (!input.isTTY) {
    console.error('\n❌ Refusing to delete: stdin is not interactive and --force was not passed.');
    console.error('   Re-run with --force to delete in a non-interactive environment.');
    // Non-interactive without --force always refuses; no need to call
    // resolveDeletion here (that path is covered by its own unit tests).
    return false;
  }

  console.log('\n⚠️  This will permanently delete ALL vectors from the index.');
  console.log(`   Index: "${indexName}"`);
  console.log(`   Vectors to delete: ${vectorCount.toLocaleString()}`);
  console.log('   This action cannot be undone.\n');

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`Type the index name "${indexName}" to confirm deletion: `);
    return resolveDeletion({ force: false, isTTY: true, indexName, answer }).proceed;
  } catch (err) {
    // Ctrl+C (SIGINT) and Ctrl+D (EOF) make readline reject the question with
    // an AbortError. That's a deliberate abort by the user, not a crash, so
    // swallow it and treat it as "not confirmed" — main() then prints the
    // friendly "Aborted. No vectors were deleted." message and exits 1,
    // instead of bubbling an ugly AbortError stack trace through main().catch.
    if (isAbortError(err)) {
      return false;
    }
    throw err;
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    return;
  }

  // Warn (don't fail) on unrecognized flags so typos like `--forse` don't
  // silently leave the destructive run unconfirmed.
  if (args.unknown.length > 0) {
    console.warn(`⚠️  Ignoring unknown argument(s): ${args.unknown.join(', ')}`);
    console.warn('   Run with --help to see valid options.\n');
  }

  console.log('🗑️  Vector Store Cleanup\n');
  console.log('═'.repeat(50));

  // Load configuration
  const config = loadConfig(args.config);

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

  // Confirm deletion (unless --force)
  if (args.force) {
    console.log('\n⚠️  --force passed: skipping confirmation.');
  } else {
    const confirmed = await confirmDeletion(indexName, beforeStats.vectorCount);
    if (!confirmed) {
      console.log('\n🚫 Aborted. No vectors were deleted.');
      process.exit(1);
    }
  }

  // Clear the index
  console.log('\n🔄 Clearing vectors...');
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
