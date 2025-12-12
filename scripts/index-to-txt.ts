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
  breadcrumbs?: string[];
}

interface DocChunk {
  id: string;
  documentPath: string;
  documentTitle: string;
  category: string;
  heading: string;
  headingLevel: number;
  content: string;
  metadata: ChunkMetadata;
}

interface DocsIndex {
  documents: any[];
  chunks: DocChunk[];
}

// =============================================================================
// FORMAT FUNCTION (matches API server output)
// =============================================================================

function formatChunks(chunks: DocChunk[], separator: string = '-------------------------------------------------------------'): string {
  const lines: string[] = [
    '# Dodo Payments Documentation',
    `> Total chunks: ${chunks.length}`,
    '',
  ];

  chunks.forEach((chunk, idx) => {
    lines.push(separator);
    lines.push(`## ${idx + 1}. ${chunk.documentTitle}`);
    
    if (chunk.metadata.sourceUrl) {
      lines.push(`URL: ${chunk.metadata.sourceUrl}`);
    }
    
    if (chunk.metadata.method && chunk.metadata.path) {
      lines.push(`API: ${chunk.metadata.method} ${chunk.metadata.path}`);
    }
    
    if (chunk.metadata.language) {
      lines.push(`Language: ${chunk.metadata.language}`);
    }
    
    if (chunk.heading && chunk.heading !== chunk.documentTitle) {
      lines.push(`Section: ${chunk.heading}`);
    }
    
    lines.push(`Category: ${chunk.category}`);
    
    if (chunk.metadata.tags && chunk.metadata.tags.length > 0) {
      lines.push(`Tags: ${chunk.metadata.tags.join(', ')}`);
    }
    
    lines.push('');
    lines.push(chunk.content || '');
    lines.push('');
  });

  return lines.join('\n');
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const dataDir = path.resolve(__dirname, '../data');
  const indexPath = path.join(dataDir, 'docs-index.json');
  const outputPath = path.join(dataDir, 'docs-full.txt');
  
  console.log('📖 Reading docs-index.json...');
  
  if (!fs.existsSync(indexPath)) {
    console.error(`❌ File not found: ${indexPath}`);
    console.log('Run "npm run parse" first to generate the index.');
    process.exit(1);
  }
  
  const indexData: DocsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  
  console.log(`📊 Found ${indexData.chunks.length} chunks`);
  
  // Format all chunks to text
  const textContent = formatChunks(indexData.chunks, '-----------------------------------------------------------');
  
  // Write to file
  fs.writeFileSync(outputPath, textContent, 'utf-8');
  
  const fileSizeMB = (Buffer.byteLength(textContent, 'utf8') / 1024 / 1024).toFixed(2);
  
  console.log(`✅ Saved to: ${outputPath}`);
  console.log(`📁 File size: ${fileSizeMB} MB`);
  console.log(`📝 Total lines: ${textContent.split('\n').length}`);
}

main().catch(console.error);
