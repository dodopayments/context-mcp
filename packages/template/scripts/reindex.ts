#!/usr/bin/env npx tsx
/**
 * ContextMCP Unified Reindex Script
 *
 * Config-driven indexing of documentation sources.
 * Reads from config.yaml, fetches sources, parses, embeds changed chunks, and uploads.
 *
 * Usage:
 *   npx tsx scripts/reindex.ts                    # Incremental reindex
 *   npx tsx scripts/reindex.ts --full             # Full rebuild
 *   npx tsx scripts/reindex.ts --source docs      # Incremental reindex of one source
 *   npx tsx scripts/reindex.ts --dry-run          # Parse and diff only, no upload
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
  deletePineconeRecordsById,
  generateEmbeddingsOpenAI,
  generateEmbeddingsGemini,
  chunkToRecord,
  prepareChunkForEmbedding,
  sleep,
} from '../src/embeddings/core.js';
import {
  assertUniqueRecordIds,
  createIndexManifest,
  createIndexedChunk,
  diffIndexManifest,
  getManifestPath,
  loadIndexManifest,
  saveIndexManifest,
  type EmbeddingSignature,
  type IndexedChunk,
  type IndexManifest,
  type ManifestDiff,
} from '../src/embeddings/manifest.js';
import {
  validateEmbeddingEnv,
  DEFAULT_BATCH_SIZE,
  DELAY_BETWEEN_BATCHES,
} from '../src/config/index.js';

// =============================================================================
// CLI ARGUMENTS
// =============================================================================

interface CliArgs {
  source?: string;
  config?: string;
  dryRun: boolean;
  full: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {
    dryRun: false,
    full: false,
    help: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--full') {
      args.full = true;
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
  --source, -s <name>    Incrementally reindex only the specified source
  --config, -c <path>    Use a custom config file path
  --dry-run              Parse and diff only, don't upload to Pinecone
  --full                 Force a full rebuild by clearing the index first

Examples:
  npx tsx scripts/reindex.ts                              # Incremental reindex
  npx tsx scripts/reindex.ts --full                       # Full rebuild
  npx tsx scripts/reindex.ts --source docs                # Reindex only changed chunks in 'docs'
  npx tsx scripts/reindex.ts --dry-run                    # Test parsing and diffing
  npx tsx scripts/reindex.ts --config test.config.yaml    # Use custom config
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
    }
  | {
      provider: 'gemini';
      gemini: GoogleGenAI;
      model: string;
      dimensions: number;
    };

async function embedAndUpload(
  indexedChunks: IndexedChunk[],
  pinecone: Pinecone,
  client: EmbedClient,
  indexName: string,
  batchSize: number
): Promise<void> {
  if (indexedChunks.length === 0) {
    console.log('   No chunks need embedding');
    return;
  }

  const index = pinecone.index(indexName);
  const total = indexedChunks.length;
  let uploaded = 0;

  console.log(`   Processing ${total} changed chunks in batches of ${batchSize}...`);

  for (let i = 0; i < total; i += batchSize) {
    const batch = indexedChunks.slice(i, i + batchSize);
    const texts = batch.map(indexedChunk => prepareChunkForEmbedding(indexedChunk.chunk));

    let embeddings: number[][];
    if (client.provider === 'gemini') {
      embeddings = await generateEmbeddingsGemini(
        client.gemini,
        client.model,
        texts,
        client.dimensions
      );
    } else {
      embeddings = await generateEmbeddingsOpenAI(client.openai, texts, client.model);
    }

    const records = batch.map((indexedChunk, idx) =>
      chunkToRecord(indexedChunk.chunk, embeddings[idx], {
        contentHash: indexedChunk.hash,
        sourceName: indexedChunk.sourceName,
      })
    );

    await index.upsert(records);

    uploaded += batch.length;
    const percent = Math.round((uploaded / total) * 100);
    process.stdout.write(`\r   Upload progress: ${uploaded}/${total} (${percent}%)`);

    if (i + batchSize < total) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  console.log('\n   Upload complete');
}

// =============================================================================
// MAIN REINDEX FUNCTION
// =============================================================================

interface ParsedChunk {
  chunk: DocChunk;
  sourceName: string;
}

async function reindex(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  console.log('');
  console.log('===============================================================');
  console.log('   ContextMCP - Documentation Reindexer');
  console.log('===============================================================');
  console.log('');

  const config = loadConfig(args.config);
  const { getChunkConfigFromConfig } = await import('../src/parser/core/config.js');
  const chunkConfig = getChunkConfigFromConfig(config);
  const fullRebuild = args.full || config.reindex.clearBeforeReindex;

  if (fullRebuild && args.source) {
    throw new Error(
      'Cannot combine --source with a full rebuild because clearing the index would remove other sources. Run without --source for a full rebuild, or remove --full/use clearBeforeReindex: false for source-scoped incremental indexing.'
    );
  }

  let sources = config.sources;
  if (args.source) {
    sources = sources.filter(source => source.name === args.source);
    if (sources.length === 0) {
      console.error(`Source '${args.source}' not found in configuration`);
      console.error(`Available sources: ${config.sources.map(source => source.name).join(', ')}`);
      process.exit(1);
    }
  }

  const embeddingSignature: EmbeddingSignature = {
    provider: config.embeddings.provider,
    model: config.embeddings.model,
    dimensions: config.embeddings.dimensions,
  };

  console.log(`Sources to process: ${sources.map(source => source.name).join(', ')}`);
  console.log(`Mode: ${args.dryRun ? 'DRY RUN' : fullRebuild ? 'FULL REBUILD' : 'INCREMENTAL'}`);
  console.log('');

  const fetchedSources: FetchedSource[] = [];

  try {
    const parsedChunks: ParsedChunk[] = [];
    const processedSourceNames: string[] = [];

    for (const source of sources) {
      console.log(`\nProcessing source: ${source.displayName || source.name}`);
      console.log(`   Type: ${source.type}, Parser: ${source.parser}`);

      try {
        const fetched = await fetchSource(source);

        if (!fetched) {
          console.log('   Skipped optional source (not found)');
          continue;
        }

        fetchedSources.push(fetched);

        const chunks = await parseSource(source, fetched, chunkConfig);
        parsedChunks.push(...chunks.map(chunk => ({ chunk, sourceName: source.name })));
        processedSourceNames.push(source.name);

        console.log(`   ${chunks.length} chunks created`);
      } catch (error) {
        console.error(`   Error: ${error}`);
        if (!source.optional) {
          throw error;
        }
      }
    }

    const allChunks = parsedChunks.map(parsedChunk => parsedChunk.chunk);
    const indexedChunks = parsedChunks.map(parsedChunk =>
      createIndexedChunk(parsedChunk.chunk, parsedChunk.sourceName, embeddingSignature, chunkConfig)
    );

    assertUniqueRecordIds(indexedChunks);

    console.log('');
    console.log('===============================================================');
    console.log(`Total chunks: ${allChunks.length}`);
    console.log('===============================================================');

    saveChunksIndex(
      allChunks,
      sources.map(source => source.name),
      args.dryRun
    );

    const manifestPath = getManifestPath();
    const loadedManifest = loadIndexManifest(manifestPath);
    const previousManifest =
      loadedManifest && loadedManifest.indexName === config.vectordb.indexName
        ? loadedManifest
        : undefined;

    if (loadedManifest && !previousManifest) {
      console.log(
        `Ignoring manifest for index '${loadedManifest.indexName}' while indexing '${config.vectordb.indexName}'`
      );
    }

    const diff = fullRebuild
      ? createFullRebuildDiff(previousManifest, indexedChunks)
      : diffIndexManifest(
          previousManifest,
          indexedChunks,
          processedSourceNames,
          embeddingSignature,
          chunkConfig
        );

    printDiff(diff);

    if (args.dryRun) {
      console.log('');
      console.log('Dry run - skipping Pinecone writes and manifest update');
      printSampleChunks(allChunks);
      return;
    }

    validateEmbeddingEnv(config.embeddings.provider as 'openai' | 'gemini');
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const embedClient = createEmbedClient(
      config.embeddings.provider,
      config.embeddings.model,
      config.embeddings.dimensions
    );
    const pineconeConfig = config.vectordb.pinecone;

    await initPineconeIndex(
      pinecone,
      config.vectordb.indexName,
      config.embeddings.dimensions,
      pineconeConfig?.cloud || 'aws',
      pineconeConfig?.region || 'us-east-1'
    );

    if (fullRebuild) {
      console.log('\nClearing existing vectors...');
      const result = await clearPineconeIndex(pinecone, config.vectordb.indexName);
      if (!result.success) {
        throw new Error('Failed to clear Pinecone index before full rebuild');
      }
    } else if (diff.deleted.length > 0) {
      await deletePineconeRecordsById(
        pinecone,
        config.vectordb.indexName,
        diff.deleted.map(chunk => chunk.recordId)
      );
    }

    const chunksToEmbed = fullRebuild ? indexedChunks : [...diff.added, ...diff.updated];
    console.log('');
    console.log(`Generating embeddings (${config.embeddings.provider}) and uploading...`);

    await embedAndUpload(
      chunksToEmbed,
      pinecone,
      embedClient,
      config.vectordb.indexName,
      config.reindex.batchSize || DEFAULT_BATCH_SIZE
    );

    const nextManifest = createIndexManifest({
      previousManifest: fullRebuild ? undefined : previousManifest,
      indexedChunks,
      processedSourceNames,
      indexName: config.vectordb.indexName,
      embedding: embeddingSignature,
      chunking: chunkConfig,
    });

    saveIndexManifest(manifestPath, nextManifest);
    console.log(`\nSaved manifest to: ${manifestPath}`);
  } finally {
    console.log('');
    console.log('Cleaning up temporary files...');
    cleanupSources(fetchedSources);
    console.log('   Done');
  }

  console.log('');
  console.log('===============================================================');
  console.log('   Reindex complete');
  console.log('===============================================================');
  console.log('');
}

function createEmbedClient(provider: string, model: string, dimensions: number): EmbedClient {
  if (provider === 'gemini') {
    return {
      provider: 'gemini',
      gemini: new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }),
      model,
      dimensions,
    };
  }

  return {
    provider: 'openai',
    openai: new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }),
    model,
  };
}

function createFullRebuildDiff(
  previousManifest: IndexManifest | undefined,
  indexedChunks: IndexedChunk[]
): ManifestDiff {
  return {
    added: indexedChunks,
    updated: [],
    unchanged: [],
    deleted: Object.entries(previousManifest?.chunks ?? {}).map(([recordId, chunk]) => ({
      recordId,
      ...chunk,
    })),
  };
}

function printDiff(diff: ManifestDiff): void {
  console.log('');
  console.log('Delta summary:');
  console.log(`   Added: ${diff.added.length}`);
  console.log(`   Updated: ${diff.updated.length}`);
  console.log(`   Unchanged: ${diff.unchanged.length}`);
  console.log(`   Deleted: ${diff.deleted.length}`);
}

function saveChunksIndex(chunks: DocChunk[], sourceNames: string[], dryRun: boolean): void {
  const dataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const outputFile = path.join(dataDir, 'chunks-index.json');
  const output = {
    generatedAt: new Date().toISOString(),
    totalChunks: chunks.length,
    sources: sourceNames,
    categories: [...new Set(chunks.map(chunk => chunk.category))].sort(),
    dryRun,
    chunks,
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`\nSaved chunks to: ${outputFile}`);
}

function printSampleChunks(chunks: DocChunk[]): void {
  if (chunks.length === 0) return;

  console.log('');
  console.log('Sample chunks:');
  for (const chunk of chunks.slice(0, 3)) {
    console.log(`\n  ${chunk.heading}`);
    console.log(`     Path: ${chunk.documentPath}`);
    console.log(`     Category: ${chunk.category}`);
    console.log(`     Size: ${chunk.content.length} chars`);
  }
}

// =============================================================================
// ENTRY POINT
// =============================================================================

reindex().catch(error => {
  console.error('');
  console.error('Reindex failed:', error);
  process.exit(1);
});
