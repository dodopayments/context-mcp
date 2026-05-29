/**
 * Convert chunks-index.json to a plain text file
 *
 * Outputs in the same format as the API server's /llms endpoint.
 *
 * Usage:
 *   npx tsx scripts/index-to-txt.ts
 *   npx tsx scripts/index-to-txt.ts --input data/chunks-index.json --output out.txt
 *   npx tsx scripts/index-to-txt.ts --force          # overwrite existing output
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  parseTxtArgs,
  resolvePaths,
  shouldRefuseOverwrite,
  formatChunks,
  type TxtChunk,
} from '../src/scripts/index-to-txt-lib.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// CLI ARGS
// =============================================================================

function parseArgs() {
  return parseTxtArgs(process.argv.slice(2));
}

function printHelp(): void {
  console.log(`
ContextMCP Index-to-Text Script

Converts a chunks-index.json file into a plain text file matching the
API server's /llms endpoint format.

Usage:
  npx tsx scripts/index-to-txt.ts [options]

Options:
  --help, -h             Show this help message
  --input, -i <path>     Input JSON file (default: data/chunks-index.json)
  --output, -o <path>    Output text file (default: data/chunks-full.txt)
  --force, -f            Overwrite the output file if it already exists

Examples:
  npx tsx scripts/index-to-txt.ts
  npx tsx scripts/index-to-txt.ts -i custom.json -o custom.txt
  npx tsx scripts/index-to-txt.ts --force
`);
}

// =============================================================================
// TYPES
// =============================================================================

interface DocsIndex {
  documents: unknown[];
  chunks: TxtChunk[];
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    return;
  }

  const dataDir = path.resolve(__dirname, '../data');
  const { inputPath, outputPath } = resolvePaths(args, dataDir);

  console.log(`📖 Reading ${inputPath}...`);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ File not found: ${inputPath}`);
    console.log('Run "npm run parse" first to generate the index.');
    process.exit(1);
  }

  if (shouldRefuseOverwrite(fs.existsSync(outputPath), args.force)) {
    console.error(`❌ Output file already exists: ${outputPath}`);
    console.error('   Pass --force to overwrite it.');
    process.exit(1);
  }

  const indexData: DocsIndex = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  
  console.log(`📊 Found ${indexData.chunks.length} chunks`);
  
  // Format all chunks to text (matches Cloudflare worker format)
  const textContent = formatChunks(indexData.chunks);
  
  // Write to file (ensure the target directory exists)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, textContent, 'utf-8');
  
  const fileSizeMB = (Buffer.byteLength(textContent, 'utf8') / 1024 / 1024).toFixed(2);
  
  console.log(`✅ Saved to: ${outputPath}`);
  console.log(`📁 File size: ${fileSizeMB} MB`);
  console.log(`📝 Total lines: ${textContent.split('\n').length}`);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
