/**
 * SDK Documentation Chunker - Optimized for GitHub SDK repositories
 *
 * Features:
 * - Hierarchical section parsing with parent-child relationships
 * - Smart merging of small sections into optimal chunks
 * - Breadcrumb context preservation
 * - Automatic file type detection (README, CHANGELOG, MIGRATION)
 * - Clean headings without markdown artifacts
 * - Proper metadata for repository context
 */

import { DocChunk } from '../../types/index.js';
import {
  SDK_CHUNK_CONFIG,
  cleanHeading,
  extractDescription,
  parseIntoTree,
  mergeHierarchicalSections,
  splitByCodeBlocks,
  normalizeLineEndings,
  FlatSection,
} from '../core/index.js';

// =============================================================================
// HEADING BUILDING
// =============================================================================

/**
 * Build a smart heading from section and breadcrumbs
 */
function buildHeading(section: FlatSection, repoName: string): string {
  // Filter out generic breadcrumbs
  const meaningfulBreadcrumbs = section.breadcrumbs.filter(
    b => b && b !== 'Introduction' && b !== 'Documentation' && b.length > 3
  );

  const parts: string[] = [];

  // Add last meaningful breadcrumb
  if (meaningfulBreadcrumbs.length > 0) {
    parts.push(meaningfulBreadcrumbs[meaningfulBreadcrumbs.length - 1]);
  }

  // Add section heading
  if (section.heading && section.heading !== 'Introduction') {
    // For changelog entries, clean up version headings
    if (section.heading.match(/^\d+\.\d+\.\d+/)) {
      parts.push(`v${section.heading.split(/\s/)[0]}`);
    } else {
      parts.push(cleanHeading(section.heading));
    }
  }

  if (parts.length === 0) {
    return `${repoName} Documentation`;
  }

  // Join with colon separator
  return parts.join(': ');
}

// =============================================================================
// LARGE SECTION SPLITTING
// =============================================================================

/**
 * Split sections that are still too large
 */
function splitLargeFlatSection(section: FlatSection): FlatSection[] {
  if (section.content.length <= SDK_CHUNK_CONFIG.maxChunkSize) {
    return [section];
  }

  const result: FlatSection[] = [];
  const content = section.content;

  // Split at code block boundaries to keep them intact
  const parts = splitByCodeBlocks(content);

  let currentChunk = '';
  let chunkIndex = 0;

  for (const part of parts) {
    if (currentChunk.length + part.length <= SDK_CHUNK_CONFIG.maxChunkSize) {
      currentChunk += part;
    } else {
      // Save current chunk
      if (currentChunk.trim().length >= SDK_CHUNK_CONFIG.minChunkSize) {
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

  // Save final chunk
  if (currentChunk.trim().length >= SDK_CHUNK_CONFIG.minChunkSize / 2) {
    result.push({
      ...section,
      heading: chunkIndex === 0 ? section.heading : `${section.heading} (continued)`,
      content: currentChunk.trim(),
    });
  }

  return result.length > 0 ? result : [section];
}

// =============================================================================
// MAIN PARSING FUNCTIONS
// =============================================================================

/**
 * Parse a README file into chunks
 */
export function parseReadme(
  content: string,
  sourceUrl: string,
  repoName: string,
  language: string = 'unknown'
): DocChunk[] {
  const normalizedContent = normalizeLineEndings(content);

  // Parse -> Merge -> Split
  const tree = parseIntoTree(normalizedContent);
  const merged = mergeHierarchicalSections(tree, SDK_CHUNK_CONFIG);

  const sections: FlatSection[] = [];
  for (const section of merged) {
    sections.push(...splitLargeFlatSection(section));
  }

  // Filter too-small chunks and skip meta-content sections
  const validSections = sections.filter(
    s =>
      s.content.length >= SDK_CHUNK_CONFIG.minChunkSize / 2 &&
      !s.heading?.toLowerCase().includes('prompt for llm')
  );

  // Convert to DocChunks with proper metadata
  return validSections.map((section, index) => ({
    id: `${repoName}/readme#${index}`,
    documentPath: `${repoName}/README.md`,
    documentTitle: `${repoName} SDK`,
    category: 'sdk-docs',
    heading: buildHeading(section, repoName),
    headingLevel: section.level || 1,
    content: section.content,
    metadata: {
      description: extractDescription(section.content),
      sourceUrl,
      repository: repoName,
      language,
      breadcrumbs: section.breadcrumbs,
    },
  }));
}

/**
 * Parse a CHANGELOG file into chunks
 */
export function parseChangelog(
  content: string,
  sourceUrl: string,
  repoName: string,
  language: string = 'unknown'
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

  // Add final version
  if (lastVersion) {
    parts.push({
      version: lastVersion,
      content: normalizedContent.slice(lastIndex).trim(),
    });
  }

  // If no versions found, fall back to readme parsing
  if (parts.length === 0) {
    return parseReadme(content, sourceUrl, repoName);
  }

  // Merge small changelog entries
  const chunks: DocChunk[] = [];
  let batch: typeof parts = [];
  let batchSize = 0;

  for (const part of parts) {
    if (part.content.length >= SDK_CHUNK_CONFIG.minChunkSize) {
      // Flush batch
      if (batch.length > 0) {
        flushChangelogBatch(batch, chunks, repoName, sourceUrl, language);
        batch = [];
        batchSize = 0;
      }

      // Add large entry
      chunks.push({
        id: `${repoName}/changelog#${chunks.length}`,
        documentPath: `${repoName}/CHANGELOG.md`,
        documentTitle: `${repoName} Changelog`,
        category: 'sdk-changelog',
        heading: `Version ${part.version}`,
        headingLevel: 2,
        content: part.content,
        metadata: {
          description: extractDescription(part.content),
          sourceUrl,
          repository: repoName,
          language,
          version: part.version,
        },
      });
    } else if (batchSize + part.content.length <= SDK_CHUNK_CONFIG.idealChunkSize) {
      batch.push(part);
      batchSize += part.content.length;
    } else {
      // Flush and start new batch
      if (batch.length > 0) {
        flushChangelogBatch(batch, chunks, repoName, sourceUrl, language);
      }
      batch = [part];
      batchSize = part.content.length;
    }
  }

  // Flush final batch
  if (batch.length > 0) {
    flushChangelogBatch(batch, chunks, repoName, sourceUrl, language);
  }

  return chunks;
}

/**
 * Flush a batch of changelog entries into a merged chunk
 */
function flushChangelogBatch(
  batch: { version: string; content: string }[],
  chunks: DocChunk[],
  repoName: string,
  sourceUrl: string,
  language: string
): void {
  const mergedContent = batch.map(b => b.content).join('\n\n');
  const versions = batch.map(b => b.version);

  const heading =
    versions.length > 1
      ? `Versions ${versions[versions.length - 1]} - ${versions[0]}`
      : `Version ${versions[0]}`;

  chunks.push({
    id: `${repoName}/changelog#${chunks.length}`,
    documentPath: `${repoName}/CHANGELOG.md`,
    documentTitle: `${repoName} Changelog`,
    category: 'sdk-changelog',
    heading,
    headingLevel: 2,
    content: mergedContent,
    metadata: {
      description: extractDescription(mergedContent),
      sourceUrl,
      repository: repoName,
      language,
      version: versions[0],
    },
  });
}

/**
 * Parse a MIGRATION guide into chunks
 */
export function parseMigration(
  content: string,
  sourceUrl: string,
  repoName: string,
  language: string = 'unknown'
): DocChunk[] {
  const normalizedContent = normalizeLineEndings(content);

  // Migration guides should stay more intact
  const tree = parseIntoTree(normalizedContent);
  const merged = mergeHierarchicalSections(tree, {
    ...SDK_CHUNK_CONFIG,
    minChunkSize: 100, // Lower threshold to keep more context
  });

  const sections = merged.filter(s => s.content.length >= 100);

  return sections.map((section, index) => ({
    id: `${repoName}/migration#${index}`,
    documentPath: `${repoName}/MIGRATION.md`,
    documentTitle: `${repoName} Migration Guide`,
    category: 'sdk-migration',
    heading: buildHeading(section, repoName),
    headingLevel: section.level || 1,
    content: section.content,
    metadata: {
      description: extractDescription(section.content),
      sourceUrl,
      repository: repoName,
      language,
      breadcrumbs: section.breadcrumbs,
    },
  }));
}

/**
 * Auto-detect file type and parse accordingly
 */
export function parseSDKFile(
  content: string,
  sourceUrl: string,
  repoName: string,
  fileName: string,
  language: string = 'unknown'
): DocChunk[] {
  const lowerName = fileName.toLowerCase();

  if (lowerName.includes('changelog')) {
    return parseChangelog(content, sourceUrl, repoName, language);
  }

  if (lowerName.includes('migration') || lowerName.includes('upgrade')) {
    return parseMigration(content, sourceUrl, repoName, language);
  }

  // Default: treat as README
  return parseReadme(content, sourceUrl, repoName, language);
}
