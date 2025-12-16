/**
 * Parse dodo-docs repository
 *
 * CLI script to clone and parse the main Dodo Payments documentation.
 *
 * Usage: npm run parse:docs
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { ParsedDocument, DocFrontmatter, DocsIndex, DocChunk } from '../types/index.js';
import { chunkDocument } from './chunkers/docs-chunker.js';
import { parseOpenApiSpec, getOpenApiInfo } from './chunkers/openapi-parser.js';
import { cloneRepo, ensureDir, TEMP_DIR, DATA_DIR } from './core/index.js';

const REPO_URL = 'https://github.com/dodopayments/dodo-docs';

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.github',
  '.cursor',
  'images',
  'logo',
  'openapi',
  'snippets',
  // Skip non-English documentation (translations)
  'ar', // Arabic
  'cn', // Chinese
  'de', // German
  'es', // Spanish
  'fr', // French
  'id', // Indonesian
  'ja', // Japanese
  'ko', // Korean
  'pt-BR', // Portuguese (Brazil)
  'vi', // Vietnamese
]);

// Files to skip
const SKIP_FILES = new Set(['README.md', 'LICENSE', 'CONTRIBUTING.md', 'styles.css']);

// =============================================================================
// FILE UTILITIES
// =============================================================================

/**
 * Get all MDX files recursively from a directory
 */
function getMdxFiles(dir: string, basePath: string = ''): string[] {
  const files: string[] = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(basePath, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        files.push(...getMdxFiles(fullPath, relativePath));
      }
    } else if (entry.isFile()) {
      if (
        (entry.name.endsWith('.mdx') || entry.name.endsWith('.md')) &&
        !SKIP_FILES.has(entry.name)
      ) {
        files.push(relativePath);
      }
    }
  }

  return files;
}

/**
 * Parse a single MDX file
 */
function parseFile(docsRoot: string, relativePath: string): ParsedDocument | null {
  const fullPath = path.join(docsRoot, relativePath);

  try {
    const fileContent = fs.readFileSync(fullPath, 'utf-8');
    const { data, content } = matter(fileContent);

    // Extract frontmatter
    const frontmatter: DocFrontmatter = {
      title: data.title || path.basename(relativePath, path.extname(relativePath)),
      description: data.description,
      sidebarTitle: data.sidebarTitle,
      icon: data.icon,
      tag: data.tag,
    };

    // Determine category from path
    const pathParts = relativePath.split(path.sep);
    const category = pathParts.length > 1 ? pathParts[0] : 'root';

    // Create slug from path
    const slug = relativePath
      .replace(/\\/g, '/')
      .replace(/\.mdx?$/, '')
      .replace(/\s+/g, '-')
      .toLowerCase();

    // Skip OpenAPI stub files - these are handled by the OpenAPI parser with rich content
    // MDX files with `openapi` frontmatter and no content are just stubs
    if (data.openapi && !content.trim()) {
      return null; // Skip - OpenAPI parser generates better content
    }

    const finalContent = content.trim();

    return {
      path: relativePath.replace(/\\/g, '/'),
      slug,
      frontmatter,
      content: finalContent,
      category,
    };
  } catch (error) {
    console.error(`Error parsing ${relativePath}:`, error);
    return null;
  }
}

// =============================================================================
// PARSING
// =============================================================================

/**
 * Parse all documentation files from a directory
 */
function parseDocsDirectory(docsRoot: string, includeOpenApi: boolean = true): DocsIndex {
  console.log(`\n📚 Parsing documentation from: ${docsRoot}\n`);

  // Get all MDX files
  const mdxFiles = getMdxFiles(docsRoot);
  console.log(`Found ${mdxFiles.length} documentation files\n`);

  // Parse all files
  const documents: ParsedDocument[] = [];
  const allChunks: DocChunk[] = [];
  const categories = new Set<string>();

  for (const file of mdxFiles) {
    const doc = parseFile(docsRoot, file);
    if (doc) {
      documents.push(doc);
      categories.add(doc.category);

      // Chunk the document
      const chunks = chunkDocument(doc);
      allChunks.push(...chunks);
    }
  }

  // Parse OpenAPI spec if available
  if (includeOpenApi) {
    const openApiPath = path.join(docsRoot, 'openapi', 'openapi.documented.yml');
    if (fs.existsSync(openApiPath)) {
      try {
        const apiInfo = getOpenApiInfo(openApiPath);
        console.log(`📖 Found OpenAPI spec: ${apiInfo.title} v${apiInfo.version}`);

        const apiChunks = parseOpenApiSpec(openApiPath, docsRoot);
        allChunks.push(...apiChunks);
        categories.add('api-reference');
      } catch (error) {
        console.error('⚠️ Error parsing OpenAPI spec:', error);
      }
    }
  }

  // Sort documents by path
  documents.sort((a, b) => a.path.localeCompare(b.path));

  console.log(`✅ Parsed ${documents.length} MDX documents`);
  console.log(`✅ Created ${allChunks.length} total chunks`);
  console.log(`✅ Categories: ${[...categories].join(', ')}\n`);

  return {
    documents,
    chunks: allChunks,
    categories: [...categories].sort(),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Save the index to a JSON file
 */
function saveIndex(index: DocsIndex, outputPath: string): void {
  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2));
  console.log(`💾 Saved index to: ${outputPath}`);
}

/**
 * Print statistics about the parsed documentation
 */
function printStats(index: DocsIndex): void {
  console.log('\n📊 Documentation Statistics:');
  console.log('─'.repeat(40));
  console.log(`Total documents: ${index.documents.length}`);
  console.log(`Total chunks: ${index.chunks.length}`);

  // Separate API and MDX chunks
  const apiChunks = index.chunks.filter(c => c.id.startsWith('api/'));
  const mdxChunks = index.chunks.filter(c => !c.id.startsWith('api/'));
  const codeChunks = apiChunks.filter(c => c.id.includes('/code/'));
  const endpointChunks = apiChunks.filter(c => !c.id.includes('/code/'));

  console.log(`\nChunk breakdown:`);
  console.log(`  MDX documentation: ${mdxChunks.length} chunks`);
  console.log(`  API endpoints: ${endpointChunks.length} chunks`);
  console.log(`  Code samples: ${codeChunks.length} chunks`);

  // Chunks by category
  console.log('\nChunks by category:');
  const chunksByCategory: Record<string, number> = {};
  for (const chunk of index.chunks) {
    chunksByCategory[chunk.category] = (chunksByCategory[chunk.category] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(chunksByCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count} chunks`);
  }

  // Code samples by language
  if (codeChunks.length > 0) {
    console.log('\nCode samples by language:');
    const byLang: Record<string, number> = {};
    for (const chunk of codeChunks) {
      const lang = chunk.metadata.language || 'unknown';
      byLang[lang] = (byLang[lang] || 0) + 1;
    }
    for (const [lang, count] of Object.entries(byLang).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${lang}: ${count} samples`);
    }
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('Parsing dodo-docs...\n');

  ensureDir(TEMP_DIR);
  const repoDir = path.join(TEMP_DIR, 'dodo-docs');
  cloneRepo(REPO_URL, repoDir);

  const index = parseDocsDirectory(repoDir);
  printStats(index);

  ensureDir(DATA_DIR);
  saveIndex(index, path.join(DATA_DIR, 'docs-index.json'));
}

main().catch(console.error);
