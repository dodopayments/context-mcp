#!/usr/bin/env npx tsx
/**
 * ContextMCP Unified Reindex Script
 *
 * Config-driven reindexing of all documentation sources.
 * Reads from config.yaml, fetches sources, parses, embeds, and uploads.
 *
 * Usage:
 *   npx tsx scripts/reindex.ts                    # Full reindex
 *   npx tsx scripts/reindex.ts --source docs      # Single source
 *   npx tsx scripts/reindex.ts --dry-run          # Parse only, no upload
 *   npx tsx scripts/reindex.ts --config path.yaml # Use custom config
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

import { loadConfig } from '../src/config/loader.js';
import { fetchSource, cleanupSources } from '../src/sources/index.js';
import type { FetchedSource } from '../src/sources/index.js';
import { parseSource } from '../src/parser/index.js';
import type { DocChunk } from '../src/types/index.js';
import {
  initPineconeIndex,
  clearPineconeIndex,
  deletePineconeVectors,
  generateEmbeddingsOpenAI,
  generateEmbeddingsGemini,
  chunkToRecord,
  prepareChunkForEmbedding,
  sleep,
} from '../src/embeddings/core.js';
import {
  validateEmbeddingEnv,
  DEFAULT_BATCH_SIZE,
  DELAY_BETWEEN_BATCHES,
} from '../src/config/index.js';
import {
  buildManifest,
  diffChunks,
  loadManifest,
  saveManifest,
  assertNoVectorIdCollisions,
} from '../src/reindex/manifest.js';

// =============================================================================
// CLI ARGUMENTS
// =============================================================================

interface CliArgs {
  source?: string;
  config?: string;
  dryRun: boolean;
  incremental: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {
    dryRun: false,
    incremental: false,
    help: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--incremental' || arg === '-i') {
      args.incremental = true;
    } else if (arg === '--source' || arg === '-s') {
      args.source = process.argv[++i];
    } else if (arg === '--config' || arg === '-c') {
      args.config = process.argv[++i];
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
ContextMCP Reindex Script

Usage:
  npx tsx scripts/reindex.ts [options]

Options:
  --help, -h             Show this help message
  --source, -s <name>    Reindex only the specified source (by name)
  --config, -c <path>    Use a custom config file path
  --incremental, -i      Only embed/upload changed chunks (uses a content-hash manifest)
  --dry-run              Parse only, don't upload to Pinecone

Examples:
  npx tsx scripts/reindex.ts                              # Full reindex
  npx tsx scripts/reindex.ts --incremental                # Only re-embed changed/new chunks
  npx tsx scripts/reindex.ts --source docs                # Reindex only 'docs' source
  npx tsx scripts/reindex.ts --dry-run                    # Test parsing without uploading
  npx tsx scripts/reindex.ts --config test.config.yaml # Use custom config
`);
}

// =============================================================================
// EMBEDDING & UPLOAD
// =============================================================================

type EmbedClient =
  | {
      provider: 'openai';
      openai: OpenAI;
      model: string;
      dimensions: number;
    }
  | {
      provider: 'gemini';
      gemini: GoogleGenAI;
      model: string;
      dimensions: number;
    };

async function embedAndUpload(
  chunks: DocChunk[],
  pinecone: Pinecone,
  client: EmbedClient,
  indexName: string,
  batchSize: number
): Promise<void> {
  const index = pinecone.index(indexName);
  const total = chunks.length;
  let uploaded = 0;

  console.log(`   Processing ${total} chunks in batches of ${batchSize}...`);

  for (let i = 0; i < total; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);

    // Prepare texts for embedding
    const texts = batch.map(chunk => prepareChunkForEmbedding(chunk));

    // Generate embeddings with the configured provider
    let embeddings: number[][];
    if (client.provider === 'gemini') {
      embeddings = await generateEmbeddingsGemini(
        client.gemini,
        client.model,
        texts,
        client.dimensions
      );
    } else {
      embeddings = await generateEmbeddingsOpenAI(
        client.openai,
        texts,
        client.model,
        client.dimensions
      );
    }

    // Convert to Pinecone records
    const records = batch.map((chunk, idx) => chunkToRecord(chunk, embeddings[idx]));

    // Upsert to Pinecone
    await index.upsert(records);

    uploaded += batch.length;
    const percent = Math.round((uploaded / total) * 100);
    process.stdout.write(`\r   Progress: ${uploaded}/${total} (${percent}%)`);

    // Delay between batches to avoid rate limits
    if (i + batchSize < total) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  console.log('\n   ✅ Upload complete');
}

// =============================================================================
// MAIN REINDEX FUNCTION
// =============================================================================

async function reindex(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Incremental mode tracks deletions via a manifest covering ALL sources, so
  // it can't be combined with a single-source filter (that would delete every
  // other source's chunks). Guard against the footgun before doing any work.
  if (args.incremental && args.source) {
    console.error('❌ --incremental cannot be combined with --source.');
    console.error('   The manifest covers all sources; run a full incremental reindex instead.');
    process.exit(1);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   ContextMCP - Documentation Reindexer');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Load configuration
  const config = loadConfig(args.config);

  // Get chunking configuration (or use defaults)
  const { getChunkConfigFromConfig } = await import('../src/parser/core/config.js');
  const chunkConfig = getChunkConfigFromConfig(config);

  // Incremental only applies to real (non-dry) runs (the guard above already
  // rejected --incremental + --source).
  const incremental = args.incremental && !args.dryRun;

  // Filter sources if --source flag is provided
  let sources = config.sources;
  if (args.source) {
    sources = sources.filter(s => s.name === args.source);
    if (sources.length === 0) {
      console.error(`❌ Source '${args.source}' not found in configuration`);
      console.error(`   Available sources: ${config.sources.map(s => s.name).join(', ')}`);
      process.exit(1);
    }
  }

  const modeLabel = args.dryRun
    ? 'DRY RUN (parse only)'
    : incremental
      ? 'INCREMENTAL (changed chunks only)'
      : 'FULL REINDEX';
  console.log(`📚 Sources to process: ${sources.map(s => s.name).join(', ')}`);
  console.log(`🔧 Mode: ${modeLabel}`);
  console.log('');

  // Initialize clients (unless dry run)
  let pinecone: Pinecone | undefined;
  let embedClient: EmbedClient | undefined;

  if (!args.dryRun) {
    validateEmbeddingEnv(config.embeddings.provider as 'openai' | 'gemini');
    pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

    if (config.embeddings.provider === 'gemini') {
      embedClient = {
        provider: 'gemini',
        gemini: new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }),
        model: config.embeddings.model,
        dimensions: config.embeddings.dimensions,
      };
    } else {
      embedClient = {
        provider: 'openai',
        openai: new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }),
        model: config.embeddings.model,
        dimensions: config.embeddings.dimensions,
      };
    }

    // Initialize and optionally clear Pinecone
    const pineconeConfig = config.vectordb.pinecone;
    await initPineconeIndex(
      pinecone,
      config.vectordb.indexName,
      config.embeddings.dimensions,
      pineconeConfig?.cloud || 'aws',
      pineconeConfig?.region || 'us-east-1'
    );

    // In incremental mode we never clear — deletions are derived from the diff.
    if (config.reindex.clearBeforeReindex && !incremental) {
      console.log('🗑️  Clearing existing vectors...');
      await clearPineconeIndex(pinecone, config.vectordb.indexName);
      console.log('');
    }
  }

  // Process each source
  const fetchedSources: FetchedSource[] = [];
  const allChunks: DocChunk[] = [];

  for (const source of sources) {
    console.log(`\n📦 Processing source: ${source.displayName || source.name}`);
    console.log(`   Type: ${source.type}, Parser: ${source.parser}`);

    try {
      // Fetch source
      const fetched = await fetchSource(source);

      if (!fetched) {
        console.log(`   ⏭️  Skipped (optional source not found)`);
        continue;
      }

      fetchedSources.push(fetched);

      // Parse source
      const chunks = await parseSource(source, fetched, chunkConfig);
      allChunks.push(...chunks);

      console.log(`   📊 ${chunks.length} chunks created`);
    } catch (error) {
      console.error(`   ❌ Error: ${error}`);
      if (!source.optional) {
        throw error;
      }
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📊 Total chunks: ${allChunks.length}`);
  console.log('═══════════════════════════════════════════════════════════════');

  // Save chunks to data/ directory for inspection
  if (allChunks.length > 0) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const outputFile = path.join(dataDir, 'chunks-index.json');
    const output = {
      generatedAt: new Date().toISOString(),
      totalChunks: allChunks.length,
      sources: sources.map(s => s.name),
      categories: [...new Set(allChunks.map(c => c.category))].sort(),
      dryRun: args.dryRun,
      chunks: allChunks,
    };

    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`\n💾 Saved chunks to: ${outputFile}`);
  }

  // Upload if not dry run
  if (!args.dryRun && allChunks.length > 0 && pinecone && embedClient) {
    const manifestPath = path.join(process.cwd(), 'data', 'reindex-manifest.json');

    // Fail loudly BEFORE embedding/uploading if two distinct chunk ids sanitize
    // to the same vector id. Otherwise the store would silently keep only one of
    // them (and the incremental delete path could clobber a live vector).
    assertNoVectorIdCollisions(allChunks);

    // Decide what to upload. In incremental mode we diff against the manifest;
    // otherwise we upload everything.
    let chunksToUpload = allChunks;

    if (incremental) {
      const previous = loadManifest(manifestPath);
      if (!previous) {
        console.log('');
        console.log('ℹ️  No previous manifest found — performing a full first-time index.');
      }

      const diff = diffChunks(allChunks, previous);
      chunksToUpload = diff.toUpsert;

      console.log('');
      console.log('🔍 Incremental diff:');
      console.log(`   ${diff.toUpsert.length} new/changed chunk(s) to embed`);
      console.log(`   ${diff.unchangedCount} unchanged chunk(s) skipped`);
      console.log(`   ${diff.toDelete.length} removed chunk(s) to delete`);

      // Delete vectors for chunks that no longer exist.
      if (diff.toDelete.length > 0) {
        console.log('');
        console.log(`🗑️  Deleting ${diff.toDelete.length} stale vector(s)...`);
        // diff.toDelete is already in vector-id space (the manifest is keyed by
        // toVectorId), so pass it straight through without re-sanitizing.
        await deletePineconeVectors(pinecone, config.vectordb.indexName, diff.toDelete);
        console.log('   ✅ Deleted');
      }
    }

    if (chunksToUpload.length > 0) {
      console.log('');
      console.log(`🔄 Generating embeddings (${config.embeddings.provider}) and uploading...`);

      await embedAndUpload(
        chunksToUpload,
        pinecone,
        embedClient,
        config.vectordb.indexName,
        config.reindex.batchSize || DEFAULT_BATCH_SIZE
      );
    } else {
      console.log('');
      console.log('✅ Nothing to upload — index is already up to date.');
    }

    // Persist the new manifest so the next incremental run can diff against it.
    // Written for every non-dry-run so a full reindex also seeds the manifest.
    saveManifest(manifestPath, buildManifest(allChunks));
    console.log(`💾 Saved reindex manifest: ${manifestPath}`);
  } else if (args.dryRun) {
    console.log('');
    console.log('ℹ️  Dry run - skipping upload');

    // Show sample chunks in dry run
    if (allChunks.length > 0) {
      console.log('');
      console.log('Sample chunks:');
      for (const chunk of allChunks.slice(0, 3)) {
        console.log(`\n  📄 ${chunk.heading}`);
        console.log(`     Path: ${chunk.documentPath}`);
        console.log(`     Category: ${chunk.category}`);
        console.log(`     Size: ${chunk.content.length} chars`);
      }
    }
  }

  // Cleanup
  console.log('');
  console.log('🧹 Cleaning up temporary files...');
  cleanupSources(fetchedSources);
  console.log('   ✅ Done');

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   ✅ Reindex complete!');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
}

// =============================================================================
// ENTRY POINT
// =============================================================================

reindex().catch(error => {
  console.error('');
  console.error('❌ Reindex failed:', error);
  process.exit(1);
});
