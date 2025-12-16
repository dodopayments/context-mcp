/**
 * Daily Documentation Reindex Script
 *
 * Orchestrates full reindexing of all documentation sources:
 * 1. Parses docs from all repositories (docs, sdk, billingsdk)
 * 2. Generates embeddings for all chunks
 * 3. Upserts vectors to Pinecone
 *
 * Usage: npm run reindex
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');

interface ReindexStats {
  startTime: string;
  endTime?: string;
  duration?: number;
  sources: Array<{
    name: string;
    parseTime: number;
    embedTime: number;
    totalChunks: number;
    success: boolean;
    error?: string;
  }>;
  totalChunks: number;
  totalErrors: number;
}

async function main() {
  console.log('🚀 Starting daily documentation reindex...\n');
  console.log('═'.repeat(60));

  const stats: ReindexStats = {
    startTime: new Date().toISOString(),
    sources: [],
    totalChunks: 0,
    totalErrors: 0,
  };

  const globalStartTime = Date.now();

  try {
    // Define all documentation sources
    const sources = [
      {
        name: 'docs',
        script: 'parse:docs',
        embedScript: 'embed:docs',
        displayName: 'Main Documentation',
      },
      {
        name: 'sdk',
        script: 'parse:sdk',
        embedScript: 'embed:sdk',
        displayName: 'SDK Documentation',
      },
      {
        name: 'billingsdk',
        script: 'parse:billingsdk',
        embedScript: 'embed:billingsdk',
        displayName: 'BillingSDK Documentation',
      },
    ];

    for (const source of sources) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`📚 ${source.displayName.toUpperCase()}`);
      console.log('═'.repeat(60));

      const sourceStats = {
        name: source.name,
        parseTime: 0,
        embedTime: 0,
        totalChunks: 0,
        success: false,
        error: undefined as string | undefined,
      };

      try {
        // ============================================================
        // STEP 1: PARSE DOCUMENTATION
        // ============================================================
        console.log(`\n🔍 STEP 1: Parsing documents...`);
        const parseStart = Date.now();

        const { stdout: parseOutput } = await execAsync(`npm run ${source.script}`, {
          cwd: path.join(__dirname, '..'),
          env: { ...process.env },
        });

        sourceStats.parseTime = (Date.now() - parseStart) / 1000;

        // Extract chunk count from parse output
        const chunkMatch =
          parseOutput.match(/Created (\d+) total chunks/i) ||
          parseOutput.match(/✅ (\d+) chunks/i) ||
          parseOutput.match(/(\d+) chunks/i);

        const parsedChunks = chunkMatch ? parseInt(chunkMatch[1]) : 0;

        console.log(`   ✅ Parsed in ${sourceStats.parseTime.toFixed(2)}s`);
        if (parsedChunks > 0) {
          console.log(`   📄 Created ${parsedChunks} chunks`);
        }

        // Read index file for accurate chunk count
        const indexPath = path.join(DATA_DIR, `${source.name}-index.json`);
        if (fs.existsSync(indexPath)) {
          const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
          sourceStats.totalChunks = index.totalChunks || index.chunks?.length || 0;

          if (sourceStats.totalChunks !== parsedChunks) {
            console.log(`   📊 Verified: ${sourceStats.totalChunks} chunks in index`);
          }
        }

        // ============================================================
        // STEP 2: GENERATE EMBEDDINGS & UPLOAD
        // ============================================================
        console.log(`\n🧠 STEP 2: Generating embeddings & uploading to Pinecone...`);
        const embedStart = Date.now();

        const { stdout: embedOutput } = await execAsync(`npm run ${source.embedScript}`, {
          cwd: path.join(__dirname, '..'),
          env: { ...process.env },
        });

        sourceStats.embedTime = (Date.now() - embedStart) / 1000;

        // Extract progress from embed output
        const batchMatches = embedOutput.matchAll(/Batch (\d+)\/(\d+).*?(\d+)\/(\d+)/g);
        let lastProcessed = 0;
        let lastTotal = 0;

        for (const match of batchMatches) {
          lastProcessed = parseInt(match[3]);
          lastTotal = parseInt(match[4]);
        }

        console.log(`   ✅ Generated embeddings in ${sourceStats.embedTime.toFixed(2)}s`);
        if (lastProcessed > 0) {
          console.log(`   📤 Uploaded ${lastProcessed}/${lastTotal} vectors to Pinecone`);
        }

        // ============================================================
        // STEP 3: SUMMARY
        // ============================================================
        const totalTime = sourceStats.parseTime + sourceStats.embedTime;
        console.log(
          `\n   ⏱️  Total: ${totalTime.toFixed(2)}s (Parse: ${sourceStats.parseTime.toFixed(
            1
          )}s + Embed: ${sourceStats.embedTime.toFixed(1)}s)`
        );
        console.log(`   � Chunks: ${sourceStats.totalChunks}`);

        sourceStats.success = true;
        stats.totalChunks += sourceStats.totalChunks;
      } catch (error) {
        sourceStats.success = false;
        sourceStats.error = error instanceof Error ? error.message : String(error);
        stats.totalErrors++;
        console.error(`\n   ❌ Error processing ${source.name}:`);
        console.error(`   ${sourceStats.error}`);
      }

      stats.sources.push(sourceStats);
    }

    // ================================================================
    // FINAL SUMMARY
    // ================================================================
    const totalDuration = (Date.now() - globalStartTime) / 1000;
    stats.endTime = new Date().toISOString();
    stats.duration = totalDuration;

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 REINDEX COMPLETE');
    console.log('═'.repeat(60));

    const minutes = Math.floor(totalDuration / 60);
    const seconds = totalDuration % 60;
    const timeStr =
      minutes > 0 ? `${minutes}m ${seconds.toFixed(0)}s` : `${totalDuration.toFixed(2)}s`;

    console.log(`\n⏱️  Total Duration: ${timeStr}`);
    console.log(`📦 Total Chunks: ${stats.totalChunks.toLocaleString()}`);
    console.log(
      `🎯 Success Rate: ${stats.sources.filter(s => s.success).length}/${stats.sources.length}`
    );
    console.log(`${stats.totalErrors === 0 ? '✅' : '⚠️ '} Errors: ${stats.totalErrors}`);

    // Detailed breakdown table
    console.log('\n📊 DETAILED BREAKDOWN:');
    console.log('─'.repeat(60));
    console.log('Source          │ Chunks │  Parse │  Embed │  Total │ Status');
    console.log('─'.repeat(60));

    for (const source of stats.sources) {
      const status = source.success ? '✅' : '❌';
      const name = source.name.padEnd(15);
      const chunks = source.totalChunks.toString().padStart(6);
      const parse = `${source.parseTime.toFixed(1)}s`.padStart(6);
      const embed = `${source.embedTime.toFixed(1)}s`.padStart(6);
      const total = `${(source.parseTime + source.embedTime).toFixed(1)}s`.padStart(6);

      console.log(`${name} │ ${chunks} │ ${parse} │ ${embed} │ ${total} │ ${status}`);

      if (source.error) {
        console.log(`${' '.repeat(15)} └─ Error: ${source.error}`);
      }
    }
    console.log('─'.repeat(60));

    // Save report
    const reportPath = path.join(__dirname, '..', 'reindex-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2));
    console.log(`💾 Report saved: reindex-report.json`);

    console.log('\n' + '═'.repeat(60));
    if (stats.totalErrors === 0) {
      console.log('✅ All sources processed successfully!');
    } else {
      console.log(`⚠️  Completed with ${stats.totalErrors} error(s)`);
    }
    console.log('═'.repeat(60) + '\n');

    // Exit with error if any source failed
    if (stats.totalErrors > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Fatal error during reindex:', error);
    stats.endTime = new Date().toISOString();

    // Save error report
    const reportPath = path.join(__dirname, '..', 'reindex-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2));

    process.exit(1);
  }
}

main();
