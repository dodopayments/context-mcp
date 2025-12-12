/**
 * Shared Section Utilities
 * 
 * Functions for splitting, merging, and processing document sections.
 */

import { ChunkConfig } from '../../types/index.js';
import { DEFAULT_CHUNK_CONFIG } from './config.js';

// Types
export interface Section {
  heading: string;
  level: number;
  content: string;
  children?: Section[];
}

export interface FlatSection {
  heading: string;
  level: number;
  content: string;
  breadcrumbs: string[];
}

// =============================================================================
// CODE BLOCK HANDLING
// =============================================================================

/**
 * Split content while keeping code blocks intact.
 * Returns an array of parts where code blocks are single elements.
 */
export function splitByCodeBlocks(content: string): string[] {
  const parts: string[] = [];
  const codeBlockRegex = /```[\s\S]*?```/g;
  let lastIndex = 0;
  let match;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    // Add code block as single part
    parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  
  return parts;
}

/**
 * Split content by code blocks, further splitting large text parts by paragraphs
 */
export function splitByCodeBlocksWithParagraphs(content: string, maxTextSize: number): string[] {
  const parts: string[] = [];
  const codeBlockRegex = /```[\s\S]*?```/g;
  let lastIndex = 0;
  let match;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      if (textBefore.length > maxTextSize) {
        // Split large text by paragraphs
        const paragraphs = textBefore.split(/\n\n+/);
        for (const para of paragraphs) {
          if (para.trim()) parts.push(para.trim() + '\n\n');
        }
      } else {
        parts.push(textBefore);
      }
    }
    parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  
  // Handle remaining text
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    if (remaining.length > maxTextSize) {
      const paragraphs = remaining.split(/\n\n+/);
      for (const para of paragraphs) {
        if (para.trim()) parts.push(para.trim() + '\n\n');
      }
    } else {
      parts.push(remaining);
    }
  }
  
  return parts;
}

// =============================================================================
// SECTION PARSING
// =============================================================================

/**
 * Parse content into sections by heading level
 */
export function parseIntoSections(content: string, minLevel: number = 2): Section[] {
  const sections: Section[] = [];
  const lines = content.split('\n');
  
  let currentHeading = 'Introduction';
  let currentLevel = 1;
  let currentContent: string[] = [];
  
  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    
    if (headingMatch && headingMatch[1].length >= minLevel) {
      // Save previous section
      if (currentContent.length > 0) {
        const sectionContent = currentContent.join('\n').trim();
        if (sectionContent.length > 0) {
          sections.push({
            heading: currentHeading,
            level: currentLevel,
            content: sectionContent,
          });
        }
      }
      
      currentHeading = headingMatch[2].trim();
      currentLevel = headingMatch[1].length;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  
  // Save final section
  if (currentContent.length > 0) {
    const sectionContent = currentContent.join('\n').trim();
    if (sectionContent.length > 0) {
      sections.push({
        heading: currentHeading,
        level: currentLevel,
        content: sectionContent,
      });
    }
  }
  
  return sections;
}

/**
 * Parse content into a hierarchical section tree
 */
export function parseIntoTree(content: string): Section[] {
  const lines = content.split('\n');
  const root: Section[] = [];
  const stack: { section: Section; level: number }[] = [];
  
  let currentContent: string[] = [];
  let introContent: string[] = [];
  let sawFirstHeading = false;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      
      // Save intro content
      if (!sawFirstHeading && introContent.length > 0) {
        const introText = introContent.join('\n').trim();
        if (introText.length > 50) {
          root.push({
            heading: 'Introduction',
            level: 0,
            content: introText,
            children: []
          });
        }
        sawFirstHeading = true;
      }
      
      // Save accumulated content to current section
      if (stack.length > 0 && currentContent.length > 0) {
        stack[stack.length - 1].section.content = currentContent.join('\n').trim();
      }
      
      // Create new section
      const newSection: Section = {
        heading: headingText,
        level,
        content: '',
        children: []
      };
      
      // Find parent (pop stack until we find a lower level)
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      
      // Add to parent or root
      if (stack.length > 0) {
        stack[stack.length - 1].section.children!.push(newSection);
      } else {
        root.push(newSection);
      }
      
      stack.push({ section: newSection, level });
      currentContent = [];
      sawFirstHeading = true;
    } else {
      if (sawFirstHeading) {
        currentContent.push(line);
      } else {
        introContent.push(line);
      }
    }
  }
  
  // Save final content
  if (stack.length > 0 && currentContent.length > 0) {
    stack[stack.length - 1].section.content = currentContent.join('\n').trim();
  }
  
  // Handle no-heading content
  if (!sawFirstHeading && introContent.length > 0) {
    const introText = introContent.join('\n').trim();
    if (introText.length > 50) {
      root.push({
        heading: 'Documentation',
        level: 0,
        content: introText,
        children: []
      });
    }
  }
  
  return root;
}

// =============================================================================
// SECTION MERGING
// =============================================================================

/**
 * Merge small sections into larger chunks
 */
export function mergeSections(
  sections: Section[], 
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): Section[] {
  const merged: Section[] = [];
  let batch: Section[] = [];
  let batchSize = 0;
  
  for (const section of sections) {
    if (section.content.length >= config.minChunkSize) {
      // Flush batch first
      if (batch.length > 0) {
        merged.push(mergeBatch(batch));
        batch = [];
        batchSize = 0;
      }
      merged.push(section);
    } else if (batchSize + section.content.length <= config.idealChunkSize) {
      batch.push(section);
      batchSize += section.content.length;
    } else {
      // Flush and start new batch
      if (batch.length > 0) {
        merged.push(mergeBatch(batch));
      }
      batch = [section];
      batchSize = section.content.length;
    }
  }
  
  // Flush remaining
  if (batch.length > 0) {
    merged.push(mergeBatch(batch));
  }
  
  return merged;
}

/**
 * Merge a batch of sections into one
 */
function mergeBatch(batch: Section[]): Section {
  if (batch.length === 1) return batch[0];
  
  const mergedContent = batch.map(s => 
    s.heading !== 'Introduction' ? `### ${s.heading}\n\n${s.content}` : s.content
  ).join('\n\n');
  
  const mergedHeading = batch
    .map(s => s.heading)
    .filter(h => h !== 'Introduction')
    .join(' / ') || 'Overview';
  
  return {
    heading: mergedHeading,
    level: Math.min(...batch.map(s => s.level)),
    content: mergedContent,
  };
}

// =============================================================================
// LARGE SECTION SPLITTING
// =============================================================================

/**
 * Extract the first ### heading from content
 */
export function extractFirstSubheading(content: string): string | null {
  const match = content.match(/^###\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Split a large section into smaller chunks
 */
export function splitLargeSection(
  section: Section, 
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): Section[] {
  if (section.content.length <= config.maxChunkSize) {
    return [section];
  }
  
  const result: Section[] = [];
  const content = section.content;
  
  // Try to split by ### subheadings first
  const subheadingChunks = splitBySubheadings(content, config.maxChunkSize);
  
  if (subheadingChunks.length > 1) {
    for (const chunk of subheadingChunks) {
      const subheading = extractFirstSubheading(chunk.content);
      result.push({
        heading: subheading ? `${section.heading}: ${subheading}` : section.heading,
        level: section.level,
        content: chunk.content.trim(),
      });
    }
    return result;
  }
  
  // Fallback: split by code blocks
  const parts = splitByCodeBlocks(content);
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (const part of parts) {
    if (currentChunk.length + part.length <= config.maxChunkSize) {
      currentChunk += part;
    } else {
      if (currentChunk.trim().length >= config.minChunkSize) {
        const chunkSubheading = extractFirstSubheading(currentChunk);
        result.push({
          heading: chunkSubheading 
            ? `${section.heading}: ${chunkSubheading}`
            : chunkIndex > 0 
              ? `${section.heading} (continued ${chunkIndex + 1})`
              : section.heading,
          level: section.level,
          content: currentChunk.trim(),
        });
        chunkIndex++;
      }
      currentChunk = part;
    }
  }
  
  // Save final chunk
  if (currentChunk.trim().length >= config.minChunkSize / 2) {
    const chunkSubheading = extractFirstSubheading(currentChunk);
    result.push({
      heading: chunkSubheading 
        ? `${section.heading}: ${chunkSubheading}`
        : chunkIndex > 0 
          ? `${section.heading} (continued ${chunkIndex + 1})`
          : section.heading,
      level: section.level,
      content: currentChunk.trim(),
    });
  }
  
  return result.length > 0 ? result : [section];
}

/**
 * Split content by ### subheadings
 */
function splitBySubheadings(
  content: string, 
  maxSize: number
): { heading: string | null; content: string }[] {
  const result: { heading: string | null; content: string }[] = [];
  const substantialSize = 800;
  
  const parts = content.split(/(?=^###\s)/m).filter(p => p.trim());
  let currentChunk = '';
  
  for (const part of parts) {
    const partSize = part.length;
    const wouldExceedMax = currentChunk.length + partSize > maxSize;
    const partIsSubstantial = partSize >= substantialSize;
    const currentIsSubstantial = currentChunk.length >= substantialSize;
    
    if (wouldExceedMax || (partIsSubstantial && currentIsSubstantial)) {
      if (currentChunk.trim()) {
        result.push({ heading: extractFirstSubheading(currentChunk), content: currentChunk.trim() });
      }
      currentChunk = part;
    } else {
      currentChunk += part;
    }
  }
  
  if (currentChunk.trim()) {
    result.push({ heading: extractFirstSubheading(currentChunk), content: currentChunk.trim() });
  }
  
  return result;
}

// =============================================================================
// HIERARCHICAL SECTION PROCESSING
// =============================================================================

/**
 * Calculate total size of a section including children
 */
export function getSectionSize(section: Section): number {
  let size = section.content.length;
  if (section.children) {
    for (const child of section.children) {
      size += getSectionSize(child);
    }
  }
  return size;
}

/**
 * Flatten a section tree back into markdown
 */
export function flattenSection(section: Section): string {
  const parts: string[] = [];
  
  if (section.heading && section.heading !== 'Introduction') {
    const level = Math.min(Math.max(section.level, 1), 4);
    parts.push(`${'#'.repeat(level)} ${section.heading}`);
  }
  
  if (section.content) {
    parts.push(section.content);
  }
  
  if (section.children) {
    for (const child of section.children) {
      parts.push(flattenSection(child));
    }
  }
  
  return parts.join('\n\n');
}

/**
 * Merge hierarchical sections into flat chunks with breadcrumbs
 */
export function mergeHierarchicalSections(
  sections: Section[],
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): FlatSection[] {
  const result: FlatSection[] = [];
  
  function processSection(section: Section, breadcrumbs: string[]): void {
    const totalSize = getSectionSize(section);
    const selfSize = section.content.length;
    
    // Case 1: Section alone is large enough
    if (selfSize >= config.minChunkSize && (!section.children || section.children.length === 0)) {
      result.push({
        heading: section.heading,
        level: section.level,
        content: section.content,
        breadcrumbs: [...breadcrumbs]
      });
      return;
    }
    
    // Case 2: Section with children fits in one chunk
    if (totalSize <= config.maxChunkSize && totalSize >= config.minChunkSize) {
      result.push({
        heading: section.heading,
        level: section.level,
        content: flattenSection(section),
        breadcrumbs: [...breadcrumbs]
      });
      return;
    }
    
    // Case 3: Too large - process children separately
    if (totalSize > config.maxChunkSize) {
      if (selfSize >= config.minChunkSize / 2) {
        result.push({
          heading: section.heading,
          level: section.level,
          content: section.content,
          breadcrumbs: [...breadcrumbs]
        });
      }
      
      const newBreadcrumbs = section.heading 
        ? [...breadcrumbs, section.heading]
        : breadcrumbs;
      
      // Batch small children together
      let batch: Section[] = [];
      let batchSize = 0;
      
      for (const child of section.children || []) {
        const childSize = getSectionSize(child);
        
        if (childSize >= config.minChunkSize) {
          if (batch.length > 0) {
            flushBatch(batch, newBreadcrumbs, config, result);
            batch = [];
            batchSize = 0;
          }
          processSection(child, newBreadcrumbs);
        } else if (batchSize + childSize <= config.idealChunkSize) {
          batch.push(child);
          batchSize += childSize;
        } else {
          if (batch.length > 0) {
            flushBatch(batch, newBreadcrumbs, config, result);
          }
          batch = [child];
          batchSize = childSize;
        }
      }
      
      if (batch.length > 0) {
        flushBatch(batch, newBreadcrumbs, config, result);
      }
      return;
    }
    
    // Case 4: Section is too small - keep anyway
    if (selfSize > 0 || (section.children && section.children.length > 0)) {
      result.push({
        heading: section.heading,
        level: section.level,
        content: flattenSection(section),
        breadcrumbs: [...breadcrumbs]
      });
    }
  }
  
  for (const section of sections) {
    processSection(section, []);
  }
  
  return result;
}

/**
 * Flush a batch of sections into result array
 */
function flushBatch(
  batch: Section[],
  breadcrumbs: string[],
  config: ChunkConfig,
  result: FlatSection[]
): void {
  if (batch.length === 0) return;
  
  if (batch.length === 1) {
    result.push({
      heading: batch[0].heading,
      level: batch[0].level,
      content: flattenSection(batch[0]),
      breadcrumbs: [...breadcrumbs]
    });
    return;
  }
  
  const mergedContent = batch.map(s => flattenSection(s)).join('\n\n');
  const mergedHeading = batch.map(s => s.heading).filter(Boolean).join(' / ') || 'Combined Section';
  
  result.push({
    heading: mergedHeading,
    level: Math.min(...batch.map(s => s.level)),
    content: mergedContent,
    breadcrumbs: [...breadcrumbs]
  });
}

