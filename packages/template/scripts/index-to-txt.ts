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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// CLI ARGS
// =============================================================================

interface CliArgs {
  input?: string;
  output?: string;
  force: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {
    force: false,
    help: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--force' || arg === '-f') {
      args.force = true;
    } else if (arg === '--input' || arg === '-i') {
      args.input = process.argv[++i];
    } else if (arg === '--output' || arg === '-o') {
      args.output = process.argv[++i];
    }
  }

  return args;
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

interface ChunkMetadata {
  description?: string;
  tags?: string[];
  sourceUrl?: string;
  repository?: string;
  language?: string;
  method?: string;
  path?: string;
}

interface DocChunk {
  id: string;
  documentPath: string;
  documentTitle: string;
  category: string;
  heading: string;
  content: string;
  metadata: ChunkMetadata;
}

interface DocsIndex {
  documents: any[];
  chunks: DocChunk[];
}

// =============================================================================
// FORMAT FUNCTION (matches Cloudflare worker output format)
// =============================================================================

function formatChunks(chunks: DocChunk[]): string {
  const lines: string[] = [
    '# Documentation',
    `> Total chunks: ${chunks.length}`,
    '',
  ];

  const separator = '-'.repeat(40);

  chunks.forEach(chunk => {
    lines.push(separator);
    // Use documentTitle (matches result.title from worker's SearchResult)
    lines.push(`## ${chunk.documentTitle}`);
    
    // Show heading if it's different from documentTitle (provides section context)
    if (chunk.heading && chunk.heading !== chunk.documentTitle) {
      lines.push(`Heading: ${chunk.heading}`);
    }
    
    // Source URL (matches result.url from worker)
    if (chunk.metadata.sourceUrl) {
      lines.push(`Source: ${chunk.metadata.sourceUrl}`);
    }
    
    // API method and path (matches result.method and result.path from worker)
    if (chunk.metadata.method && chunk.metadata.path) {
      lines.push(`API: ${chunk.metadata.method} ${chunk.metadata.path}`);
    }
    
    // Language (matches result.language from worker)
    if (chunk.metadata.language) {
      lines.push(`Language: ${chunk.metadata.language}`);
    }
    
    // Empty line before content (matches worker format)
    lines.push('');
    
    // Content (matches result.content from worker)
    lines.push(chunk.content || '');
    
    // Empty line after content (matches worker format)
    lines.push('');
  });

  return lines.join('\n');
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
  const indexPath = args.input
    ? path.resolve(args.input)
    : path.join(dataDir, 'chunks-index.json');
  const outputPath = args.output
    ? path.resolve(args.output)
    : path.join(dataDir, 'chunks-full.txt');

  console.log(`📖 Reading ${indexPath}...`);

  if (!fs.existsSync(indexPath)) {
    console.error(`❌ File not found: ${indexPath}`);
    console.log('Run "npm run parse" first to generate the index.');
    process.exit(1);
  }

  if (fs.existsSync(outputPath) && !args.force) {
    console.error(`❌ Output file already exists: ${outputPath}`);
    console.error('   Pass --force to overwrite it.');
    process.exit(1);
  }

  const indexData: DocsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  
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
