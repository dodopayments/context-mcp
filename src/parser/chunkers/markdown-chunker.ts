/**
 * Markdown Documentation Chunker
 *
 * Parser for plain markdown files without JSX components.
 * Optimized for README, CHANGELOG, MIGRATION, and general documentation.
 *
 * Features:
 * - Hierarchical section parsing with breadcrumb context
 * - Smart merging of small sections
 * - Automatic file type detection
 * - Clean headings without markdown artifacts
 */

import * as fs from 'fs';
import * as path from 'path';
import { DocChunk, ChunkConfig } from '../../types/index.js';
import { SourceConfig } from '../../config/schema.js';
import {
  DEFAULT_CHUNK_CONFIG,
  cleanHeading,
  extractDescription,
  parseIntoTree,
  mergeHierarchicalSections,
  splitByCodeBlocks,
  normalizeLineEndings,
  FlatSection,
} from '../core/index.js';

// =============================================================================
// TYPES
// =============================================================================

interface SkipPatterns {
  skipDirs: string[];
  skipFiles: string[];
}

// =============================================================================
// FILE DISCOVERY
// =============================================================================

function findMarkdownFiles(
  dir: string,
  skip: SkipPatterns,
  baseDir: string = dir
): string[] {
  const files: string[] = [];
  const skipDirsSet = new Set(skip.skipDirs.map(d => d.toLowerCase()));
  const skipFilesSet = new Set(skip.skipFiles.map(f => f.toLowerCase()));

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        // Skip directories from skipDirs list
        if (skipDirsSet.has(entry.name.toLowerCase())) continue;
        files.push(...findMarkdownFiles(fullPath, skip, baseDir));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        // Skip files from skipFiles list
        if (skipFilesSet.has(entry.name.toLowerCase())) continue;
        files.push(relativePath);
      }
    }
  } catch {
    // Directory not accessible
  }

  return files;
}

// =============================================================================
// HEADING BUILDING
// =============================================================================

function buildHeading(section: FlatSection, contextName: string): string {
  const meaningfulBreadcrumbs = section.breadcrumbs.filter(
    b => b && b !== 'Introduction' && b !== 'Documentation' && b.length > 3
  );

  const parts: string[] = [];

  if (meaningfulBreadcrumbs.length > 0) {
    parts.push(meaningfulBreadcrumbs[meaningfulBreadcrumbs.length - 1]);
  }

  if (section.heading && section.heading !== 'Introduction') {
    // For changelog entries, clean up version headings
    if (section.heading.match(/^\d+\.\d+\.\d+/)) {
      parts.push(`v${section.heading.split(/\s/)[0]}`);
    } else {
      parts.push(cleanHeading(section.heading));
    }
  }

  if (parts.length === 0) {
    return `${contextName} Documentation`;
  }

  return parts.join(': ');
}

// =============================================================================
// LARGE SECTION SPLITTING
// =============================================================================

function splitLargeFlatSection(section: FlatSection, chunkConfig: ChunkConfig): FlatSection[] {
  if (section.content.length <= chunkConfig.maxChunkSize) {
    return [section];
  }

  const result: FlatSection[] = [];
  const parts = splitByCodeBlocks(section.content);

  let currentChunk = '';
  let chunkIndex = 0;

  for (const part of parts) {
    if (currentChunk.length + part.length <= chunkConfig.maxChunkSize) {
      currentChunk += part;
    } else {
      if (currentChunk.trim().length >= chunkConfig.minChunkSize) {
        result.push({
          ...section,
          heading: chunkIndex === 0 ? section.heading : `${section.heading} (continued)`,
          content: currentChunk.trim(),
        });
        chunkIndex++;
      }
      currentChunk = part;
    }
  }

  if (currentChunk.trim().length >= chunkConfig.minChunkSize / 2) {
    result.push({
      ...section,
      heading: chunkIndex === 0 ? section.heading : `${section.heading} (continued)`,
      content: currentChunk.trim(),
    });
  }

  return result.length > 0 ? result : [section];
}

// =============================================================================
// FILE PARSERS
// =============================================================================

function parseReadme(
  content: string,
  sourceUrl: string,
  contextName: string,
  language: string = 'unknown',
  chunkConfig: ChunkConfig = DEFAULT_CHUNK_CONFIG
): DocChunk[] {
  const normalizedContent = normalizeLineEndings(content);

  const tree = parseIntoTree(normalizedContent);
  const merged = mergeHierarchicalSections(tree, chunkConfig);

  const sections: FlatSection[] = [];
  for (const section of merged) {
    sections.push(...splitLargeFlatSection(section, chunkConfig));
  }

  const validSections = sections.filter(
    s => s.content.length >= chunkConfig.minChunkSize / 2
  );

  return validSections.map((section, index) => ({
    id: `${contextName}/readme#${index}`,
    documentPath: `${contextName}/README.md`,
    documentTitle: `${contextName}`,
    category: 'documentation',
    heading: buildHeading(section, contextName),
    content: section.content,
    metadata: {
      description: extractDescription(section.content),
      sourceUrl,
      repository: contextName,
      language,
    },
  }));
}

function parseChangelog(
  content: string,
  sourceUrl: string,
  contextName: string,
  language: string = 'unknown',
  chunkConfig: ChunkConfig = DEFAULT_CHUNK_CONFIG
): DocChunk[] {
  const normalizedContent = normalizeLineEndings(content);

  // Split by version headers
  const versionRegex = /^##?\s*\[?v?(\d+\.\d+\.\d+[^\]\n]*)\]?/gm;
  const parts: { version: string; content: string }[] = [];
  let match;
  let lastIndex = 0;
  let lastVersion = '';

  while ((match = versionRegex.exec(normalizedContent)) !== null) {
    if (lastVersion) {
      parts.push({
        version: lastVersion,
        content: normalizedContent.slice(lastIndex, match.index).trim(),
      });
    }
    lastVersion = match[1].trim();
    lastIndex = match.index;
  }

  if (lastVersion) {
    parts.push({
      version: lastVersion,
      content: normalizedContent.slice(lastIndex).trim(),
    });
  }

  if (parts.length === 0) {
    return parseReadme(content, sourceUrl, contextName, language, chunkConfig);
  }
  const chunks: DocChunk[] = [];
  let batch: typeof parts = [];
  let batchSize = 0;

  for (const part of parts) {
    // Check if individual part exceeds maxChunkSize and split if needed
    if (part.content.length > chunkConfig.maxChunkSize) {
      const subParts = splitByCodeBlocks(part.content);
      let currentSubPart = '';
      for (const subPart of subParts) {
        if (currentSubPart.length + subPart.length <= chunkConfig.maxChunkSize) {
          currentSubPart += subPart;
        } else {
          if (currentSubPart.trim().length >= chunkConfig.minChunkSize) {
            chunks.push({
              id: `${contextName}/changelog#${chunks.length}`,
              documentPath: `${contextName}/CHANGELOG.md`,
              documentTitle: `${contextName} Changelog`,
              category: 'changelog',
              heading: `Version ${part.version}`,
              content: currentSubPart.trim(),
              metadata: {
                description: extractDescription(currentSubPart),
                sourceUrl,
                repository: contextName,
                language,
                version: part.version,
              },
            });
          }
          currentSubPart = subPart;
        }
      }
      if (currentSubPart.trim().length >= chunkConfig.minChunkSize) {
        chunks.push({
          id: `${contextName}/changelog#${chunks.length}`,
          documentPath: `${contextName}/CHANGELOG.md`,
          documentTitle: `${contextName} Changelog`,
          category: 'changelog',
          heading: `Version ${part.version}`,
          content: currentSubPart.trim(),
          metadata: {
            description: extractDescription(currentSubPart),
            sourceUrl,
            repository: contextName,
            language,
            version: part.version,
          },
        });
      }
      continue;
    }

    if (part.content.length >= chunkConfig.minChunkSize) {
      if (batch.length > 0) {
        flushChangelogBatch(batch, chunks, contextName, sourceUrl, language, chunkConfig);
        batch = [];
        batchSize = 0;
      }

      chunks.push({
        id: `${contextName}/changelog#${chunks.length}`,
        documentPath: `${contextName}/CHANGELOG.md`,
        documentTitle: `${contextName} Changelog`,
        category: 'changelog',
        heading: `Version ${part.version}`,
        content: part.content,
        metadata: {
          description: extractDescription(part.content),
          sourceUrl,
          repository: contextName,
          language,
          version: part.version,
        },
      });
    } else if (batchSize + part.content.length <= chunkConfig.idealChunkSize) {
      batch.push(part);
      batchSize += part.content.length;
    } else {
      if (batch.length > 0) {
        flushChangelogBatch(batch, chunks, contextName, sourceUrl, language, chunkConfig);
      }
      batch = [part];
      batchSize = part.content.length;
    }
  }

  if (batch.length > 0) {
    flushChangelogBatch(batch, chunks, contextName, sourceUrl, language, chunkConfig);
  }

  return chunks;
}

function flushChangelogBatch(
  batch: { version: string; content: string }[],
  chunks: DocChunk[],
  contextName: string,
  sourceUrl: string,
  language: string,
  chunkConfig: ChunkConfig
): void {
  const mergedContent = batch.map(b => b.content).join('\n\n');
  const versions = batch.map(b => b.version);

  // Check if merged batch exceeds maxChunkSize and split if needed
  if (mergedContent.length > chunkConfig.maxChunkSize) {
    const parts = splitByCodeBlocks(mergedContent);
    let currentPart = '';
    let partIndex = 0;
    
    for (const part of parts) {
      if (currentPart.length + part.length <= chunkConfig.maxChunkSize) {
        currentPart += part;
      } else {
        if (currentPart.trim().length >= chunkConfig.minChunkSize) {
          const heading = versions.length > 1
            ? `Versions ${versions[versions.length - 1]} - ${versions[0]} (Part ${partIndex + 1})`
            : `Version ${versions[0]} (Part ${partIndex + 1})`;
          
          chunks.push({
            id: `${contextName}/changelog#${chunks.length}`,
            documentPath: `${contextName}/CHANGELOG.md`,
            documentTitle: `${contextName} Changelog`,
            category: 'changelog',
            heading,
            content: currentPart.trim(),
            metadata: {
              description: extractDescription(currentPart),
              sourceUrl,
              repository: contextName,
              language,
              version: versions[0],
            },
          });
          partIndex++;
        }
        currentPart = part;
      }
    }
    
    if (currentPart.trim().length >= chunkConfig.minChunkSize) {
      const heading = versions.length > 1
        ? `Versions ${versions[versions.length - 1]} - ${versions[0]}${partIndex > 0 ? ` (Part ${partIndex + 1})` : ''}`
        : `Version ${versions[0]}${partIndex > 0 ? ` (Part ${partIndex + 1})` : ''}`;
      
      chunks.push({
        id: `${contextName}/changelog#${chunks.length}`,
        documentPath: `${contextName}/CHANGELOG.md`,
        documentTitle: `${contextName} Changelog`,
        category: 'changelog',
        heading,
        content: currentPart.trim(),
        metadata: {
          description: extractDescription(currentPart),
          sourceUrl,
          repository: contextName,
          language,
          version: versions[0],
        },
      });
    }
  } else {
    const heading =
      versions.length > 1
        ? `Versions ${versions[versions.length - 1]} - ${versions[0]}`
        : `Version ${versions[0]}`;

    chunks.push({
      id: `${contextName}/changelog#${chunks.length}`,
      documentPath: `${contextName}/CHANGELOG.md`,
      documentTitle: `${contextName} Changelog`,
      category: 'changelog',
      heading,
      content: mergedContent,
      metadata: {
        description: extractDescription(mergedContent),
        sourceUrl,
        repository: contextName,
        language,
        version: versions[0],
      },
    });
  }
}

function parseMigration(
  content: string,
  sourceUrl: string,
  contextName: string,
  language: string = 'unknown',
  chunkConfig: ChunkConfig = DEFAULT_CHUNK_CONFIG
): DocChunk[] {
  const normalizedContent = normalizeLineEndings(content);

  const tree = parseIntoTree(normalizedContent);
  const merged = mergeHierarchicalSections(tree, {
    ...chunkConfig,
    minChunkSize: 100,
  });

  const sections = merged.filter(s => s.content.length >= 100);

  return sections.map((section, index) => ({
    id: `${contextName}/migration#${index}`,
    documentPath: `${contextName}/MIGRATION.md`,
    documentTitle: `${contextName} Migration Guide`,
    category: 'migration',
    heading: buildHeading(section, contextName),
    content: section.content,
    metadata: {
      description: extractDescription(section.content),
      sourceUrl,
      repository: contextName,
      language,
    },
  }));
}

function parseMarkdownFile(
  content: string,
  sourceUrl: string,
  contextName: string,
  fileName: string,
  language: string = 'unknown',
  chunkConfig: ChunkConfig = DEFAULT_CHUNK_CONFIG
): DocChunk[] {
  const lowerName = fileName.toLowerCase();

  if (lowerName.includes('changelog')) {
    return parseChangelog(content, sourceUrl, contextName, language, chunkConfig);
  }

  if (lowerName.includes('migration') || lowerName.includes('upgrade')) {
    return parseMigration(content, sourceUrl, contextName, language, chunkConfig);
  }

  return parseReadme(content, sourceUrl, contextName, language, chunkConfig);
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Parse markdown documentation from a source
 */
export function parseMarkdownSource(
  source: SourceConfig,
  localPath: string,
  chunkConfig: ChunkConfig = DEFAULT_CHUNK_CONFIG
): DocChunk[] {
  const files = findMarkdownFiles(localPath, {
    skipDirs: source.skipDirs,
    skipFiles: source.skipFiles,
  });

  if (files.length === 0) {
    return [];
  }

  const allChunks: DocChunk[] = [];
  const contextName = source.displayName || source.name;
  const language = source.language || 'unknown';

  for (const file of files) {
    const fullPath = path.join(localPath, file);
    const content = fs.readFileSync(fullPath, 'utf-8');

    // Build source URL
    const sourceUrl = source.repository
      ? `https://github.com/${source.repository}/blob/main/${file}`
      : source.baseUrl
      ? `${source.baseUrl.replace(/\/$/, '')}/${file}`
      : '';

    // Determine contextual name
    const dirName = path.dirname(file);
    const fileContextName =
      dirName !== '.' ? `${contextName}/${path.basename(dirName)}` : contextName;

    const chunks = parseMarkdownFile(content, sourceUrl, fileContextName, file, language, chunkConfig);
    allChunks.push(...chunks);
  }

  return allChunks;
}
