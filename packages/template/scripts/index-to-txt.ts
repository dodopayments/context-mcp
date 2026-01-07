/**
 * Convert docs-index.json to a plain text file
 * 
 * Outputs in the same format as the API server's /llms endpoint
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  const dataDir = path.resolve(__dirname, '../data');
  const indexPath = path.join(dataDir, 'chunks-index.json');
  const outputPath = path.join(dataDir, 'chunks-full.txt');
  
  console.log('📖 Reading chunks-index.json...');
  
  if (!fs.existsSync(indexPath)) {
    console.error(`❌ File not found: ${indexPath}`);
    console.log('Run "npm run parse" first to generate the index.');
    process.exit(1);
  }
  
  const indexData: DocsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  
  console.log(`📊 Found ${indexData.chunks.length} chunks`);
  
  // Format all chunks to text (matches Cloudflare worker format)
  const textContent = formatChunks(indexData.chunks);
  
  // Write to file
  fs.writeFileSync(outputPath, textContent, 'utf-8');
  
  const fileSizeMB = (Buffer.byteLength(textContent, 'utf8') / 1024 / 1024).toFixed(2);
  
  console.log(`✅ Saved to: ${outputPath}`);
  console.log(`📁 File size: ${fileSizeMB} MB`);
  console.log(`📝 Total lines: ${textContent.split('\n').length}`);
}

main().catch(console.error);
