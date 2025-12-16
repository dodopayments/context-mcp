/**
 * Documentation Chunker - Smart ## + Tab Splitting
 *
 * Strategy:
 * 1. Split by ## headings
 * 2. If a ## section contains <Tab> elements, split each tab into its own chunk
 * 3. Each tab chunk includes the parent ## heading as context
 * 4. Sections without tabs remain as single chunks
 */

import { DocChunk, ChunkConfig } from '../../types/index.js';
import {
  DOCS_BASE_URL,
  DOCS_CHUNK_CONFIG,
  extractDescription,
  cleanMintlifyMdxPreserveTabs,
  finalCleanup,
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
    tag?: string;
  };
}

// =============================================================================
// NUMBERED EXAMPLE SPLITTING
// =============================================================================

interface NumberedExample {
  number: string;
  title: string;
  content: string;
}

/**
 * Detect and split sections containing multiple numbered examples (### 1., ### 2., etc.)
 * This is crucial for semantic search - each example should be its own chunk
 */
function splitNumberedExamples(sectionContent: string): NumberedExample[] | null {
  // Match numbered headings like "### 1.", "### 2.", "### 10." etc.
  // Also match variations like "### 1:" or just "### 1 Simple Example"
  const numberedHeadingRegex = /^###\s+(\d+)[\.\:\)]\s*(.*)$/gm;

  const matches = [...sectionContent.matchAll(numberedHeadingRegex)];

  // Only split if there are 2+ numbered examples
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

    // Only include if content is substantial
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

/**
 * Get intro content before the first numbered example
 */
function getContentBeforeNumberedExamples(sectionContent: string): string {
  const firstNumberedHeading = sectionContent.search(/^###\s+\d+[\.\:\)]\s*/m);
  if (firstNumberedHeading === -1) {
    return '';
  }
  return sectionContent.substring(0, firstNumberedHeading).trim();
}

// =============================================================================
// TAB EXTRACTION
// =============================================================================

interface TabContent {
  title: string;
  content: string;
}

/**
 * Extract tabs from a section. Returns null if no tabs found.
 */
function extractTabs(sectionContent: string): TabContent[] | null {
  // Check if section contains Tab elements
  if (!/<Tab\s+title=/i.test(sectionContent)) {
    return null;
  }

  const tabs: TabContent[] = [];

  // Match each <Tab title="...">...</Tab>
  const tabRegex = /<Tab\s+title="([^"]+)"[^>]*>([\s\S]*?)<\/Tab>/gi;
  let match;

  while ((match = tabRegex.exec(sectionContent)) !== null) {
    const title = match[1].trim();
    let content = match[2].trim();

    // Clean the tab content
    content = finalCleanup(content);

    if (content.length > 50) {
      // Only include tabs with meaningful content
      tabs.push({ title, content });
    }
  }

  return tabs.length > 0 ? tabs : null;
}

/**
 * Get content before any Tab elements in a section
 */
function getContentBeforeTabs(sectionContent: string): string {
  // Find where first <Tab starts
  const tabStart = sectionContent.search(/<Tab\s+title=/i);
  if (tabStart === -1) {
    return sectionContent;
  }

  return sectionContent.substring(0, tabStart).trim();
}

// =============================================================================
// OVERSIZED SECTION SPLITTING
// =============================================================================

/**
 * Split an oversized section into smaller chunks while preserving code blocks.
 * Uses code blocks as natural boundaries, then falls back to paragraphs.
 */
function splitOversizedSection(content: string, maxSize: number): string[] {
  const chunks: string[] = [];

  // First, try to split by code blocks
  const codeBlockRegex = /```[\s\S]*?```/g;
  const parts: { type: 'text' | 'code'; content: string }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    // Add code block as single part
    parts.push({ type: 'code', content: match[0] });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  // Now combine parts into chunks under maxSize
  let currentChunk = '';

  for (const part of parts) {
    // If this single part exceeds maxSize, it needs special handling
    if (part.content.length > maxSize) {
      // Save current chunk first
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      if (part.type === 'code') {
        // Code block too large - keep it as-is (don't break code)
        chunks.push(part.content);
      } else {
        // Text too large - split by paragraphs
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
          currentChunk = paraChunk; // Continue building
        }
      }
    } else if (currentChunk.length + part.content.length > maxSize) {
      // Adding this part would exceed maxSize - start new chunk
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = part.content;
    } else {
      // Add to current chunk
      currentChunk += part.content;
    }
  }

  // Don't forget remaining content
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [content];
}

// =============================================================================
// MAIN CHUNKING LOGIC
// =============================================================================

export function chunkDocument(
  doc: ParsedDocument,
  config: ChunkConfig = DOCS_CHUNK_CONFIG
): DocChunk[] {
  const chunks: DocChunk[] = [];
  const sourceUrl = `${DOCS_BASE_URL}/${doc.slug}`;

  // Clean MDX content but preserve Tab structure
  const cleanedContent = cleanMintlifyMdxPreserveTabs(doc.content);

  // Split by ## headings
  const sections = cleanedContent.split(/^(?=## )/m);

  let chunkIndex = 0;

  for (const section of sections) {
    if (!section.trim()) continue;

    // Extract section heading
    const headingMatch = section.match(/^##\s+(.+)$/m);
    const sectionHeading = headingMatch ? headingMatch[1].trim() : 'Introduction';

    // Skip meta-content sections (not useful for semantic search)
    if (sectionHeading.toLowerCase().includes('prompt for llm')) {
      continue;
    }
    const isIntro = !headingMatch;

    // PRIORITY 1: Check for numbered examples (### 1., ### 2., etc.)
    const numberedExamples = splitNumberedExamples(section);

    if (numberedExamples && numberedExamples.length >= 2) {
      // Section has multiple numbered examples - create a chunk for each
      // Get intro content before the examples
      const introContent = getContentBeforeNumberedExamples(section);
      const introText = finalCleanup(introContent.replace(/^##\s+.+\n*/m, '')).trim();

      for (const example of numberedExamples) {
        const exampleHeading = `${sectionHeading}: ${example.title}`;

        // Build chunk content with parent context
        let chunkContent = `## ${sectionHeading}\n\n`;

        // Add brief intro context if present and not too long
        if (introText && introText.length > 30 && introText.length < 300) {
          chunkContent += introText + '\n\n';
        }

        chunkContent += example.content;

        chunks.push({
          id: `${doc.slug}#${chunkIndex++}`,
          documentPath: doc.path,
          documentTitle: doc.frontmatter.title,
          category: doc.category,
          heading: exampleHeading,
          headingLevel: 3,
          content: finalCleanup(chunkContent),
          metadata: {
            description: extractDescription(example.content) || example.title,
            sourceUrl,
            breadcrumbs: [sectionHeading],
          },
        });
      }
      continue; // Processed, skip to next section
    }

    // PRIORITY 2: Check if this section has tabs
    const tabs = extractTabs(section);

    if (tabs && tabs.length > 1) {
      // Section has multiple tabs - create a chunk for each tab
      // Include parent heading as context

      // Also get any content before the tabs (intro text)
      const beforeTabs = getContentBeforeTabs(section);
      const introText = finalCleanup(beforeTabs.replace(/^##\s+.+\n*/m, '')).trim();

      for (const tab of tabs) {
        const tabHeading = `${sectionHeading} - ${tab.title}`;

        // Build chunk content with parent context
        let chunkContent = `## ${sectionHeading}\n\n### ${tab.title}\n\n`;

        // Add intro text if present (but keep it short)
        if (introText && introText.length > 50 && introText.length < 500) {
          chunkContent += introText + '\n\n';
        }

        chunkContent += tab.content;

        chunks.push({
          id: `${doc.slug}#${chunkIndex++}`,
          documentPath: doc.path,
          documentTitle: doc.frontmatter.title,
          category: doc.category,
          heading: tabHeading,
          headingLevel: 3,
          content: chunkContent,
          metadata: {
            description: extractDescription(tab.content) || tab.title,
            sourceUrl,
            breadcrumbs: [sectionHeading],
          },
        });
      }
      continue; // Processed, skip to next section
    }

    // PRIORITY 3: No tabs or single tab - process as regular section
    let sectionContent = section;

    // If there's a single tab, just remove the Tab wrapper
    if (tabs && tabs.length === 1) {
      // Replace Tab with its content, converting title to ###
      sectionContent = section.replace(
        /<Tab\s+title="([^"]+)"[^>]*>([\s\S]*?)<\/Tab>/gi,
        '\n### $1\n$2'
      );
    }

    // Final cleanup
    sectionContent = finalCleanup(sectionContent);

    // Skip very short sections
    if (sectionContent.trim().length < 100) continue;

    // PRIORITY 4: Split oversized sections by paragraphs/code blocks
    if (sectionContent.length > config.maxChunkSize) {
      const subChunks = splitOversizedSection(sectionContent, config.maxChunkSize);

      for (let i = 0; i < subChunks.length; i++) {
        const subChunk = subChunks[i];
        if (subChunk.trim().length < config.minChunkSize) continue;

        const subHeading =
          subChunks.length > 1 ? `${sectionHeading} (Part ${i + 1})` : sectionHeading;

        chunks.push({
          id: `${doc.slug}#${chunkIndex++}`,
          documentPath: doc.path,
          documentTitle: doc.frontmatter.title,
          category: doc.category,
          heading: subHeading,
          headingLevel: isIntro ? 1 : 2,
          content: subChunk,
          metadata: {
            description:
              extractDescription(subChunk) || doc.frontmatter.description || sectionHeading,
            sourceUrl,
          },
        });
      }
    } else {
      // Section fits in one chunk
      chunks.push({
        id: `${doc.slug}#${chunkIndex++}`,
        documentPath: doc.path,
        documentTitle: doc.frontmatter.title,
        category: doc.category,
        heading: sectionHeading,
        headingLevel: isIntro ? 1 : 2,
        content: sectionContent,
        metadata: {
          description:
            extractDescription(sectionContent) || doc.frontmatter.description || sectionHeading,
          sourceUrl,
        },
      });
    }
  }

  return chunks;
}

/**
 * Format a chunk for display/debugging
 */
export function formatChunk(chunk: DocChunk): string {
  const parts: string[] = [];

  parts.push(`### ${chunk.heading}`);
  parts.push('');
  parts.push(`Source: ${chunk.metadata.sourceUrl}`);
  parts.push('');
  if (chunk.metadata.description) {
    parts.push(chunk.metadata.description);
    parts.push('');
  }
  // For display, show a preview of content (not full content as it's in heading/desc)
  const contentPreview = chunk.content.replace(/^##?\s+.+\n*/gm, '').trim();
  if (contentPreview.length > 500) {
    parts.push(contentPreview.substring(0, 500) + '...');
  } else {
    parts.push(contentPreview);
  }
  parts.push('');
  parts.push('--------------------------------');

  return parts.join('\n');
}
