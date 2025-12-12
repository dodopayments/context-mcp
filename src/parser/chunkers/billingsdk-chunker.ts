/**
 * BillingSDK Documentation Chunker - Optimized for Fumadocs MDX format
 * 
 * Features:
 * - Handles Fumadocs components (Tabs, Tab, Callout, Cards, Card)
 * - Extracts installation commands for all package managers
 * - Preserves component documentation structure
 * - Handles nested Tabs (preview/code + package managers)
 * - Cleans up JSX components for better RAG retrieval
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { DocChunk } from '../../types/index.js';
import {
  BILLINGSDK_CHUNK_CONFIG,
  BILLINGSDK_DOCS_URL,
  extractDescription,
  cleanFumadocsMdx,
  normalizeWhitespace,
  splitLargeSection,
  Section,
} from '../core/index.js';

// =============================================================================
// FUMADOCS TAB EXTRACTION
// =============================================================================

/**
 * Extract content from nested Tabs by counting opening/closing tags
 */
function extractNestedTabsContent(content: string, startPattern: RegExp): { fullMatch: string; innerContent: string } | null {
  const startMatch = content.match(startPattern);
  if (!startMatch) return null;
  
  const startIndex = content.indexOf(startMatch[0]);
  let depth = 0;
  let endIndex = startIndex;
  let foundStart = false;
  
  for (let i = startIndex; i < content.length; i++) {
    if (content.substring(i, i + 5) === '<Tabs') {
      depth++;
      foundStart = true;
    } else if (content.substring(i, i + 7) === '</Tabs>') {
      depth--;
      if (depth === 0 && foundStart) {
        endIndex = i + 7;
        break;
      }
    }
  }
  
  const fullMatch = content.substring(startIndex, endIndex);
  const innerStart = fullMatch.indexOf('>') + 1;
  const innerEnd = fullMatch.lastIndexOf('</Tabs>');
  const innerContent = fullMatch.substring(innerStart, innerEnd);
  
  return { fullMatch, innerContent };
}

/**
 * Extract npx command from tab content
 */
function extractNpxCommand(content: string): string | null {
  // Look for npx tab content
  const npxTabMatch = content.match(/<Tab\s+value="npx"[^>]*>([\s\S]*?)<\/Tab>/i);
  if (npxTabMatch) {
    const codeMatch = npxTabMatch[1].match(/```(?:bash)?\s*([\s\S]*?)```/);
    if (codeMatch) {
      return codeMatch[1].trim();
    }
  }
  
  // Try direct code block
  const directCodeMatch = content.match(/```(?:bash)?\s*(npx[^\n`]+)/);
  if (directCodeMatch) {
    return directCodeMatch[1].trim();
  }
  
  return null;
}

/**
 * Clean individual tab content
 */
function cleanTabContent(content: string): string {
  return content
    .replace(/<[^>]+>/g, '') // Remove remaining HTML/JSX tags
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extract and flatten Tabs content - keeping all package manager variants
 */
function extractTabsContent(content: string): string {
  let result = content;

  // Handle outer Tabs (shadcn vs billingSDK)
  const shadcnBillingPattern = /<Tabs\s+items=\{\['shadcn',\s*'billingSDK'\]\}/i;
  
  let extracted = extractNestedTabsContent(result, shadcnBillingPattern);
  while (extracted) {
    const { fullMatch, innerContent } = extracted;
    
    const shadcnExtracted = extractNestedTabsContent(innerContent, /<Tab\s+value="shadcn"/);
    const billingExtracted = extractNestedTabsContent(innerContent, /<Tab\s+value="billingSDK"/);
    
    const commands: string[] = [];
    
    if (shadcnExtracted) {
      const npxCmd = extractNpxCommand(shadcnExtracted.innerContent);
      if (npxCmd) commands.push(`**Using shadcn CLI:**\n\`\`\`bash\n${npxCmd}\n\`\`\``);
    }
    
    if (billingExtracted) {
      const npxCmd = extractNpxCommand(billingExtracted.innerContent);
      if (npxCmd) commands.push(`**Using BillingSDK CLI:**\n\`\`\`bash\n${npxCmd}\n\`\`\``);
    }
    
    const replacement = commands.length > 0 ? commands.join('\n\n') : '';
    result = result.replace(fullMatch, replacement);
    
    extracted = extractNestedTabsContent(result, shadcnBillingPattern);
  }

  // Handle Preview/Code tabs
  const previewCodeRegex = /<Tabs\s+items=\{\['Preview',\s*'Code'\]\}[^>]*>([\s\S]*?)<\/Tabs>/gi;
  result = result.replace(previewCodeRegex, '[Component preview available in documentation]');

  // Handle remaining simple tabs
  const simpleTabsRegex = /<Tabs\s+items=\{\[([^\]]+)\]\}[^>]*>([\s\S]*?)<\/Tabs>/gi;
  result = result.replace(simpleTabsRegex, (match, items, innerContent) => {
    const npxCmd = extractNpxCommand(innerContent);
    if (npxCmd) {
      return `\`\`\`bash\n${npxCmd}\n\`\`\``;
    }
    
    const firstTabMatch = innerContent.match(/<Tab[^>]*>([\s\S]*?)<\/Tab>/i);
    if (firstTabMatch) {
      return cleanTabContent(firstTabMatch[1]);
    }
    
    return '';
  });

  // Clean up remaining Tab tags
  result = result.replace(/<Tab[^>]*>/gi, '');
  result = result.replace(/<\/Tab>/gi, '');
  result = result.replace(/<Tabs[^>]*>/gi, '');
  result = result.replace(/<\/Tabs>/gi, '');
  
  // Clean up empty code blocks
  result = result.replace(/```\w*\s*```/g, '');
  result = normalizeWhitespace(result);

  return result;
}

// =============================================================================
// HIERARCHICAL CHUNKING HELPERS
// =============================================================================

/**
 * Split content by a specific heading level (e.g., 2 for ##, 3 for ###)
 * Includes the heading line itself in the content for self-contained chunks
 */
function splitByHeadingLevel(content: string, level: number): Section[] {
  const sections: Section[] = [];
  const headingPrefix = '#'.repeat(level);
  const lines = content.split('\n');
  
  let currentHeading = 'Introduction';
  let currentHeadingLine = '';
  let currentContent: string[] = [];
  let introContent: string[] = [];
  let sawFirstHeading = false;
  
  for (const line of lines) {
    const headingMatch = line.match(new RegExp(`^${headingPrefix}\\s+(.+)$`));
    
    if (headingMatch) {
      // Save intro content before first heading
      if (!sawFirstHeading && introContent.length > 0) {
        const introText = introContent.join('\n').trim();
        if (introText.length > 50) {
          sections.push({
            heading: 'Introduction',
            level: level - 1,
            content: introText,
          });
        }
        sawFirstHeading = true;
      }
      
      // Save previous section (including its heading line)
      if (sawFirstHeading && currentContent.length > 0) {
        const sectionContent = currentHeadingLine 
          ? `${currentHeadingLine}\n\n${currentContent.join('\n').trim()}`
          : currentContent.join('\n').trim();
        sections.push({
          heading: currentHeading,
          level: level,
          content: sectionContent,
        });
      }
      
      currentHeading = headingMatch[1].trim();
      currentHeadingLine = line; // Store the full heading line (## Heading)
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
  
  // Save final section (including its heading line)
  if (sawFirstHeading && (currentContent.length > 0 || currentHeadingLine)) {
    const sectionContent = currentHeadingLine 
      ? `${currentHeadingLine}\n\n${currentContent.join('\n').trim()}`
      : currentContent.join('\n').trim();
    sections.push({
      heading: currentHeading,
      level: level,
      content: sectionContent,
    });
  }
  
  // If no headings found, return entire content as one section
  if (sections.length === 0 && content.trim().length > 0) {
    sections.push({
      heading: 'Content',
      level: level,
      content: content.trim(),
    });
  }
  
  return sections;
}

/**
 * Merge a batch of sections into one, with parent heading prefix
 */
function mergeBatchSections(batch: Section[], parentHeading: string): Section {
  if (batch.length === 1) {
    return {
      heading: parentHeading ? `${parentHeading}: ${batch[0].heading}` : batch[0].heading,
      level: batch[0].level,
      content: batch[0].content,
    };
  }
  
  const mergedContent = batch.map(s => 
    s.heading !== 'Introduction' ? `### ${s.heading}\n\n${s.content}` : s.content
  ).join('\n\n');
  
  const mergedHeading = batch
    .map(s => s.heading)
    .filter(h => h !== 'Introduction')
    .slice(0, 2)
    .join(' / ') || 'Content';
  
  return {
    heading: parentHeading ? `${parentHeading}: ${mergedHeading}` : mergedHeading,
    level: Math.min(...batch.map(s => s.level)),
    content: mergedContent,
  };
}

// =============================================================================
// MAIN PARSING FUNCTIONS
// =============================================================================

/**
 * Parse a single BillingSDK MDX file into chunks
 */
export async function parseBillingSdkFile(
  content: string,
  filePath: string,
  sourceUrl: string
): Promise<DocChunk[]> {
  // Parse frontmatter
  const { data, content: mdxContent } = matter(content);
  const title = data.title || path.basename(filePath, '.mdx');
  const description = data.description || '';
  
  // Clean and process MDX
  let cleanedContent = cleanFumadocsMdx(mdxContent);
  cleanedContent = extractTabsContent(cleanedContent);
  
  // Determine category from path
  const pathParts = filePath.split(/[/\\]/);
  let category = 'billingsdk';
  if (pathParts.includes('components')) {
    const componentIdx = pathParts.indexOf('components');
    if (componentIdx + 1 < pathParts.length) {
      category = `billingsdk-${pathParts[componentIdx + 1]}`;
    } else {
      category = 'billingsdk-components';
    }
  } else if (pathParts.some(p => p === 'cli.mdx')) {
    category = 'billingsdk-cli';
  } else if (pathParts.some(p => p === 'theming.mdx')) {
    category = 'billingsdk-theming';
  } else if (pathParts.some(p => p === 'interfaces.mdx')) {
    category = 'billingsdk-types';
  }
  
  // Smart hierarchical chunking:
  // 1. Try to keep entire document together if small enough
  // 2. Otherwise split by H2 headings
  // 3. If an H2 section is too large, split by H3
  // 4. Continue recursively
  
  const finalSections: Section[] = [];
  
  // If entire content fits in one chunk, keep it together
  if (cleanedContent.length <= BILLINGSDK_CHUNK_CONFIG.maxChunkSize) {
    finalSections.push({
      heading: title,
      level: 1,
      content: cleanedContent.trim(),
    });
  } else {
    // Split by main headings (H2)
    const h2Sections = splitByHeadingLevel(cleanedContent, 2);
    
    for (const h2Section of h2Sections) {
      if (h2Section.content.length <= BILLINGSDK_CHUNK_CONFIG.maxChunkSize) {
        // H2 section fits, keep it as one chunk
        finalSections.push(h2Section);
      } else {
        // H2 is too large, try splitting by H3
        const h3Sections = splitByHeadingLevel(h2Section.content, 3);
        
        if (h3Sections.length > 1) {
          // We have H3 sub-sections, process them
          let currentBatch: Section[] = [];
          let currentSize = 0;
          
          for (const h3Section of h3Sections) {
            const sectionSize = h3Section.content.length;
            
            if (sectionSize > BILLINGSDK_CHUNK_CONFIG.maxChunkSize) {
              // Flush current batch
              if (currentBatch.length > 0) {
                finalSections.push(mergeBatchSections(currentBatch, h2Section.heading));
                currentBatch = [];
                currentSize = 0;
              }
              // This H3 is still too large, split it further
              finalSections.push(...splitLargeSection({
                heading: `${h2Section.heading}: ${h3Section.heading}`,
                level: 3,
                content: h3Section.content
              }, BILLINGSDK_CHUNK_CONFIG));
            } else if (currentSize + sectionSize <= BILLINGSDK_CHUNK_CONFIG.idealChunkSize) {
              // Add to current batch
              currentBatch.push(h3Section);
              currentSize += sectionSize;
            } else {
              // Flush and start new batch
              if (currentBatch.length > 0) {
                finalSections.push(mergeBatchSections(currentBatch, h2Section.heading));
              }
              currentBatch = [h3Section];
              currentSize = sectionSize;
            }
          }
          
          // Flush remaining batch
          if (currentBatch.length > 0) {
            finalSections.push(mergeBatchSections(currentBatch, h2Section.heading));
          }
        } else {
          // No H3 sub-sections, just split the large H2
          finalSections.push(...splitLargeSection(h2Section, BILLINGSDK_CHUNK_CONFIG));
        }
      }
    }
  }
  
  // If no sections found, create one chunk from entire content  
  if (finalSections.length === 0 && cleanedContent.trim().length >= BILLINGSDK_CHUNK_CONFIG.minChunkSize) {
    finalSections.push({
      heading: title,
      level: 1,
      content: cleanedContent.trim(),
    });
  }
  
  // Create slug from path
  const slug = filePath
    .replace(/\\/g, '/')
    .replace(/\.mdx?$/, '')
    .replace(/^content\/docs\//, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  
  // Convert to DocChunks
  return finalSections.map((section, index) => ({
    id: `billingsdk/${slug}#${index}`,
    documentPath: filePath.replace(/\\/g, '/'),
    documentTitle: title,
    category,
    heading: section.heading === 'Introduction' ? title : `${title}: ${section.heading}`,
    headingLevel: section.level,
    content: section.content,
    metadata: {
      description: section.heading === 'Introduction' 
        ? description || extractDescription(section.content)
        : extractDescription(section.content),
      sourceUrl,
      repository: 'dodopayments/billingsdk',
      language: 'typescript',
    }
  }));
}

/**
 * Recursively find all MDX files
 */
function findMdxFiles(dir: string, basePath: string = ''): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(basePath, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...findMdxFiles(fullPath, relativePath));
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      if (entry.name !== 'meta.json') {
        files.push(relativePath);
      }
    }
  }
  
  return files;
}

/**
 * Parse all BillingSDK docs from content/docs directory
 */
export async function parseBillingSdkDocs(repoDir: string): Promise<DocChunk[]> {
  const docsDir = path.join(repoDir, 'content', 'docs');
  
  if (!fs.existsSync(docsDir)) {
    console.log(`  ⚠️ No content/docs directory found in ${repoDir}`);
    return [];
  }
  
  const chunks: DocChunk[] = [];
  const files = findMdxFiles(docsDir);
  
  console.log(`  Found ${files.length} MDX files in content/docs`);
  
  for (const file of files) {
    const fullPath = path.join(docsDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    // Strip '/index' suffix for index.mdx files (Fumadocs URL convention)
    const urlPath = file
      .replace(/\.mdx$/, '')
      .replace(/\\/g, '/')
      .replace(/\/index$/, ''); // Remove trailing /index
    const sourceUrl = urlPath 
      ? `${BILLINGSDK_DOCS_URL}/${urlPath}`
      : BILLINGSDK_DOCS_URL; // Handle root index.mdx
    
    try {
      const fileChunks = await parseBillingSdkFile(content, file, sourceUrl);
      chunks.push(...fileChunks);
      console.log(`    ${file}: ${fileChunks.length} chunks`);
    } catch (error) {
      console.error(`    ❌ Error parsing ${file}:`, error);
    }
  }
  
  return chunks;
}

/**
 * Check if a repository is BillingSDK (has content/docs structure)
 */
export function isBillingSdkRepo(repoDir: string): boolean {
  const docsDir = path.join(repoDir, 'content', 'docs');
  const sourceConfig = path.join(repoDir, 'source.config.ts');
  return fs.existsSync(docsDir) && fs.existsSync(sourceConfig);
}
