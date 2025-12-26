/**
 * MDX Documentation Chunker
 *
 * Unified chunker for MDX documentation with JSX components.
 * Supports both Mintlify and Fumadocs component patterns.
 *
 * Features:
 * - Split by ## headings
 * - Extract and process <Tab>/<Tabs> components
 * - Handle Fumadocs items={[...]} syntax
 * - Split numbered examples (### 1., ### 2., etc.)
 * - Clean JSX components for RAG retrieval
 */

import * as fs from 'fs';
import * as path from 'path';
import * as grayMatter from 'gray-matter';
import { DocChunk, ChunkConfig } from '../../types/index.js';
import { SourceConfig } from '../../config/schema.js';
import {
  extractDescription,
  cleanMintlifyMdxPreserveTabs,
  cleanFumadocsMdx,
  finalCleanup,
  DEFAULT_CHUNK_CONFIG
} from '../core/index.js';

// =============================================================================
// TYPES
// =============================================================================

interface ParsedDocument {
  path: string;
  slug: string;
  content: string;
  category: string;
  frontmatter: {
    title: string;
    description?: string;
  };
  sourceUrl: string;
}

interface TabContent {
  title: string;
  content: string;
}

interface NumberedExample {
  number: string;
  title: string;
  content: string;
}

// =============================================================================
// FILE DISCOVERY
// =============================================================================

interface SkipPatterns {
  skipDirs: string[];
  skipFiles: string[];
}

/**
 * Find all MDX/MD files in a directory
 */
function findMdxFiles(dir: string, skip: SkipPatterns): string[] {
  const files: string[] = [];
  const skipDirsSet = new Set(skip.skipDirs.map(d => d.toLowerCase()));
  const skipFilesSet = new Set(skip.skipFiles.map(f => f.toLowerCase()));

  function walk(currentDir: string, basePath: string = '') {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.join(basePath, entry.name).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        // Skip directories from skipDirs list
        if (skipDirsSet.has(entry.name.toLowerCase())) {
          continue;
        }
        walk(fullPath, relativePath);
      } else if (entry.isFile() && /\.(mdx?|MDX?)$/.test(entry.name)) {
        // Skip files from skipFiles list
        if (skipFilesSet.has(entry.name.toLowerCase())) {
          continue;
        }
        // Skip meta files
        if (entry.name === 'meta.json' || entry.name === '_meta.json') {
          continue;
        }
        files.push(relativePath);
      }
    }
  }

  walk(dir);
  return files;
}

// =============================================================================
// TAB EXTRACTION (Mintlify style)
// =============================================================================

/**
 * Extract tabs from a section. Returns null if no tabs found.
 */
function extractMintlifyTabs(sectionContent: string): TabContent[] | null {
  if (!/\<Tab\s+title=/i.test(sectionContent)) {
    return null;
  }

  const tabs: TabContent[] = [];
  const tabRegex = /<Tab\s+title="([^"]+)"[^>]*>([\s\S]*?)<\/Tab>/gi;
  let match;

  while ((match = tabRegex.exec(sectionContent)) !== null) {
    const title = match[1].trim();
    let content = match[2].trim();
    content = finalCleanup(content);

    if (content.length > 50) {
      tabs.push({ title, content });
    }
  }

  return tabs.length > 0 ? tabs : null;
}

/**
 * Extract tabs with Fumadocs items={[...]} syntax
 */
function extractFumadocsTabs(sectionContent: string): TabContent[] | null {
  // Match <Tabs items={['A', 'B']}>
  const tabsMatch = sectionContent.match(/<Tabs\s+items=\{\[([^\]]+)\]\}/);
  if (!tabsMatch) {
    return null;
  }

  const tabs: TabContent[] = [];
  const tabRegex = /<Tab\s+value="([^"]+)"[^>]*>([\s\S]*?)<\/Tab>/gi;
  let match;

  while ((match = tabRegex.exec(sectionContent)) !== null) {
    const title = match[1].trim();
    let content = match[2].trim();
    content = finalCleanup(content);

    if (content.length > 50) {
      tabs.push({ title, content });
    }
  }

  return tabs.length > 0 ? tabs : null;
}

/**
 * Get content before any Tab elements in a section
 */
function getContentBeforeTabs(sectionContent: string): string {
  const tabStart = sectionContent.search(/<Tab[\s>]/i);
  if (tabStart === -1) {
    return sectionContent;
  }
  return sectionContent.substring(0, tabStart).trim();
}

// =============================================================================
// NUMBERED EXAMPLE SPLITTING
// =============================================================================

/**
 * Detect and split sections with numbered examples
 */
function splitNumberedExamples(sectionContent: string): NumberedExample[] | null {
  const numberedHeadingRegex = /^###\s+(\d+)[\.:\)]\s*(.*)$/gm;
  const matches = [...sectionContent.matchAll(numberedHeadingRegex)];

  if (matches.length < 2) {
    return null;
  }

  const examples: NumberedExample[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const startIndex = match.index!;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index! : sectionContent.length;

    const exampleContent = sectionContent.slice(startIndex, endIndex).trim();
    const exampleNumber = match[1];
    const exampleTitle = match[2].trim() || `Example ${exampleNumber}`;

    if (exampleContent.length > 100) {
      examples.push({
        number: exampleNumber,
        title: exampleTitle,
        content: exampleContent,
      });
    }
  }

  return examples.length >= 2 ? examples : null;
}

function getContentBeforeNumberedExamples(sectionContent: string): string {
  const firstNumberedHeading = sectionContent.search(/^###\s+\d+[\.:\)]\s*/m);
  if (firstNumberedHeading === -1) {
    return '';
  }
  return sectionContent.substring(0, firstNumberedHeading).trim();
}

// =============================================================================
// OVERSIZED SECTION SPLITTING
// =============================================================================

function splitOversizedSection(content: string, maxSize: number): string[] {
  const chunks: string[] = [];
  const codeBlockRegex = /```[\s\S]*?```/g;
  const parts: { type: 'text' | 'code'; content: string }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', content: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  let currentChunk = '';

  for (const part of parts) {
    if (part.content.length > maxSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      if (part.type === 'code') {
        chunks.push(part.content);
      } else {
        const paragraphs = part.content.split(/\n\n+/);
        let paraChunk = '';

        for (const para of paragraphs) {
          if (paraChunk.length + para.length + 2 > maxSize) {
            if (paraChunk.trim()) {
              chunks.push(paraChunk.trim());
            }
            paraChunk = para;
          } else {
            paraChunk += (paraChunk ? '\n\n' : '') + para;
          }
        }

        if (paraChunk.trim()) {
          currentChunk = paraChunk;
        }
      }
    } else if (currentChunk.length + part.content.length > maxSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = part.content;
    } else {
      currentChunk += part.content;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [content];
}

// =============================================================================
// MDX CLEANING
// =============================================================================

/**
 * Detect and apply appropriate MDX cleaning
 */
function cleanMdxContent(content: string): string {
  // Detect Fumadocs pattern
  if (content.includes('items={[') || content.includes('<Callout type=')) {
    return cleanFumadocsMdx(content);
  }

  // Default to Mintlify pattern
  return cleanMintlifyMdxPreserveTabs(content);
}

// =============================================================================
// DOCUMENT CHUNKING
// =============================================================================

function chunkDocument(
  doc: ParsedDocument,
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): DocChunk[] {
  const chunkConfig = config;
  const chunks: DocChunk[] = [];
  const cleanedContent = cleanMdxContent(doc.content);

  // Split by ## headings
  const sections = cleanedContent.split(/^(?=## )/m);

  let chunkIndex = 0;

  for (const section of sections) {
    if (!section.trim()) continue;

    const headingMatch = section.match(/^##\s+(.+)$/m);
    const sectionHeading = headingMatch ? headingMatch[1].trim() : 'Introduction';
    const isIntro = !headingMatch;

    // Priority 1: Numbered examples
    const numberedExamples = splitNumberedExamples(section);

    if (numberedExamples && numberedExamples.length >= 2) {
      const introContent = getContentBeforeNumberedExamples(section);
      const introText = finalCleanup(introContent.replace(/^##\s+.+\n*/m, '')).trim();

      for (const example of numberedExamples) {
        const exampleHeading = `${sectionHeading}: ${example.title}`;
        let chunkContent = `## ${sectionHeading}\n\n`;

        if (introText && introText.length > 30 && introText.length < 300) {
          chunkContent += introText + '\n\n';
        }

        chunkContent += example.content;

        // Check if example exceeds maxChunkSize and split if needed
        if (chunkContent.length > chunkConfig.maxChunkSize) {
          const subChunks = splitOversizedSection(chunkContent, chunkConfig.maxChunkSize);
          for (let i = 0; i < subChunks.length; i++) {
            const subChunk = subChunks[i];
            if (subChunk.trim().length < chunkConfig.minChunkSize) continue;

            const subHeading = subChunks.length > 1 
              ? `${exampleHeading} (Part ${i + 1})` 
              : exampleHeading;

            chunks.push({
              id: `${doc.slug}#${chunkIndex++}`,
              documentPath: doc.path,
              documentTitle: doc.frontmatter.title,
              category: doc.category,
              heading: subHeading,
              content: finalCleanup(subChunk),
              metadata: {
                description: extractDescription(subChunk) || example.title,
                sourceUrl: doc.sourceUrl,
              },
            });
          }
        } else {
          chunks.push({
            id: `${doc.slug}#${chunkIndex++}`,
            documentPath: doc.path,
            documentTitle: doc.frontmatter.title,
            category: doc.category,
            heading: exampleHeading,
            content: finalCleanup(chunkContent),
            metadata: {
              description: extractDescription(example.content) || example.title,
              sourceUrl: doc.sourceUrl,
            },
          });
        }
      }
      continue;
    }

    // Priority 2: Tabs (Mintlify or Fumadocs)
    const tabs = extractMintlifyTabs(section) || extractFumadocsTabs(section);

    if (tabs && tabs.length > 1) {
      const beforeTabs = getContentBeforeTabs(section);
      const introText = finalCleanup(beforeTabs.replace(/^##\s+.+\n*/m, '')).trim();

      // Calculate total size if all tabs were combined
      const introSize = introText.length;
      const tabsSize = tabs.reduce((sum, tab) => sum + tab.content.length, 0);
      const headerSize = sectionHeading.length + 50; // Approximate header overhead
      const totalSize = introSize + tabsSize + headerSize + (tabs.length * 50); // Tab headers overhead

      // If combined size is within maxChunkSize, combine all tabs into one chunk
      if (totalSize <= chunkConfig.maxChunkSize) {
        let combinedContent = `## ${sectionHeading}\n\n`;

        if (introText && introText.length > 30) {
          combinedContent += introText + '\n\n';
        }

        // Add all tabs
        for (const tab of tabs) {
          combinedContent += `### ${tab.title}\n\n${tab.content}\n\n`;
        }

        chunks.push({
          id: `${doc.slug}#${chunkIndex++}`,
          documentPath: doc.path,
          documentTitle: doc.frontmatter.title,
          category: doc.category,
          heading: sectionHeading,
          content: finalCleanup(combinedContent.trim()),
          metadata: {
            description: extractDescription(introText || tabs[0].content) || sectionHeading,
            sourceUrl: doc.sourceUrl,
          },
        });
      } else {
        // Split into individual tab chunks if too large
        for (const tab of tabs) {
          const tabHeading = `${sectionHeading} - ${tab.title}`;
          let chunkContent = `## ${sectionHeading}\n\n### ${tab.title}\n\n`;

          if (introText && introText.length > 50 && introText.length < 500) {
            chunkContent += introText + '\n\n';
          }

          chunkContent += tab.content;

          // Check if individual tab exceeds maxChunkSize and split if needed
          if (chunkContent.length > chunkConfig.maxChunkSize) {
            const subChunks = splitOversizedSection(chunkContent, chunkConfig.maxChunkSize);
            for (let i = 0; i < subChunks.length; i++) {
              const subChunk = subChunks[i];
              if (subChunk.trim().length < chunkConfig.minChunkSize) continue;

              const subHeading = subChunks.length > 1 
                ? `${tabHeading} (Part ${i + 1})` 
                : tabHeading;

              chunks.push({
                id: `${doc.slug}#${chunkIndex++}`,
                documentPath: doc.path,
                documentTitle: doc.frontmatter.title,
                category: doc.category,
                heading: subHeading,
                content: finalCleanup(subChunk),
                metadata: {
                  description: extractDescription(subChunk) || tab.title,
                  sourceUrl: doc.sourceUrl,
                },
              });
            }
          } else {
            chunks.push({
              id: `${doc.slug}#${chunkIndex++}`,
              documentPath: doc.path,
              documentTitle: doc.frontmatter.title,
              category: doc.category,
              heading: tabHeading,
              content: finalCleanup(chunkContent),
              metadata: {
                description: extractDescription(tab.content) || tab.title,
                sourceUrl: doc.sourceUrl,
              },
            });
          }
        }
      }
      continue;
    }

    // Priority 3: Regular section
    let sectionContent = section;

    // Remove single tab wrapper
    if (tabs && tabs.length === 1) {
      sectionContent = section.replace(
        /<Tab\s+title="([^"]+)"[^>]*>([\s\S]*?)<\/Tab>/gi,
        '\n### $1\n$2'
      );
    }

    sectionContent = finalCleanup(sectionContent);

    if (sectionContent.trim().length < 100) continue;

    // Priority 4: Split oversized sections
    if (sectionContent.length > chunkConfig.maxChunkSize) {
      const subChunks = splitOversizedSection(sectionContent, chunkConfig.maxChunkSize);

      for (let i = 0; i < subChunks.length; i++) {
        const subChunk = subChunks[i];
        if (subChunk.trim().length < chunkConfig.minChunkSize) continue;

        const subHeading =
          subChunks.length > 1 ? `${sectionHeading} (Part ${i + 1})` : sectionHeading;

        chunks.push({
          id: `${doc.slug}#${chunkIndex++}`,
          documentPath: doc.path,
          documentTitle: doc.frontmatter.title,
          category: doc.category,
          heading: subHeading,
          content: subChunk,
          metadata: {
            description:
              extractDescription(subChunk) || doc.frontmatter.description || sectionHeading,
            sourceUrl: doc.sourceUrl,
          },
        });
      }
    } else {
      chunks.push({
        id: `${doc.slug}#${chunkIndex++}`,
        documentPath: doc.path,
        documentTitle: doc.frontmatter.title,
        category: doc.category,
        heading: sectionHeading,
        content: sectionContent,
        metadata: {
          description:
            extractDescription(sectionContent) || doc.frontmatter.description || sectionHeading,
          sourceUrl: doc.sourceUrl,
        },
      });
    }
  }

  return chunks;
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Parse MDX documentation from a source
 */
export function parseMDXSource(
  source: SourceConfig,
  localPath: string,
  chunkConfig: ChunkConfig = DEFAULT_CHUNK_CONFIG
): DocChunk[] {
  const files = findMdxFiles(localPath, {
    skipDirs: source.skipDirs,
    skipFiles: source.skipFiles,
  });

  if (files.length === 0) {
    console.log(`   ⚠️  No MDX/MD files found in ${localPath}`);
    return [];
  }

  const allChunks: DocChunk[] = [];

  for (const file of files) {
    const fullPath = path.join(localPath, file);
    const content = fs.readFileSync(fullPath, 'utf-8');

    // Parse frontmatter
    const { data, content: mdxContent } = grayMatter.default(content);
    const title = data.title || path.basename(file, path.extname(file));

    // Build slug and URL
    const slug = file
      .replace(/\\/g, '/')
      .replace(/\.(mdx?|MDX?)$/, '')
      .replace(/\/index$/, '');

    const sourceUrl = source.baseUrl
      ? `${source.baseUrl.replace(/\/$/, '')}/${slug}`
      : source.repository
      ? `https://github.com/${source.repository}/blob/main/${source.path || ''}/${file}`
          .replace(/\/+/g, '/')
          .replace(':/', '://')
      : '';

    // Determine category
    const pathParts = file.split(/[/\\]/);
    let category = source.displayName || source.name;
    if (pathParts.length > 1) {
      category = `${category}/${pathParts[0]}`;
    }

    const doc: ParsedDocument = {
      path: file,
      slug: `${source.name}/${slug}`,
      content: mdxContent,
      category,
      frontmatter: {
        title,
        description: data.description,
      },
      sourceUrl,
    };

    const chunks = chunkDocument(doc, chunkConfig);
    allChunks.push(...chunks);
  }

  return allChunks;
}
