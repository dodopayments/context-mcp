/**
 * Shared Text Utilities
 * 
 * Common text cleaning and extraction functions used across all parsers.
 */

// =============================================================================
// HEADING CLEANING
// =============================================================================

/**
 * Clean heading text - remove markdown formatting, links, newlines
 */
export function cleanHeading(heading: string): string {
  return heading
    .replace(/`([^`]+)`/g, '$1')             // Remove inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1')       // Remove bold
    .replace(/\*([^*]+)\*/g, '$1')           // Remove italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
    .replace(/\n+/g, ' ')                    // Replace newlines
    .replace(/\s+/g, ' ')                    // Normalize spaces
    .trim();
}

// =============================================================================
// DESCRIPTION EXTRACTION
// =============================================================================

/**
 * Extract a description from markdown content.
 * Finds the first meaningful paragraph (skips headings, lists, code, etc.)
 */
export function extractDescription(content: string, maxLength: number = 200): string {
  // Remove code blocks first
  const withoutCode = content.replace(/```[\s\S]*?```/g, '');
  const paragraphs = withoutCode.split(/\n\n+/);
  
  for (const para of paragraphs) {
    const trimmed = para.trim();
    
    // Skip non-prose content
    if (!trimmed || 
        trimmed.startsWith('#') || 
        trimmed.startsWith('-') || 
        trimmed.startsWith('*') && !trimmed.startsWith('**') ||
        trimmed.startsWith('|') ||
        trimmed.startsWith('>') ||
        trimmed.startsWith('[') ||
        trimmed.startsWith('**') && trimmed.endsWith('**') ||
        trimmed.length < 30) {
      continue;
    }
    
    // Clean markdown formatting
    let desc = trimmed
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .trim();
    
    if (desc.length > maxLength) {
      desc = desc.slice(0, maxLength - 3) + '...';
    }
    
    return desc;
  }
  
  return '';
}

// =============================================================================
// MDX / MARKDOWN CLEANING
// =============================================================================

/**
 * Remove import/export statements from MDX content
 */
export function removeImportsExports(content: string): string {
  let cleaned = content;
  
  // Remove import statements (but not inside code blocks)
  cleaned = cleaned.replace(/^import\s+.*?['"];?\s*$/gm, (match, offset) => {
    const beforeContent = cleaned.substring(0, offset);
    const lastCodeBlockStart = beforeContent.lastIndexOf('```');
    const lastCodeBlockEnd = beforeContent.lastIndexOf('```', lastCodeBlockStart - 1);
    if (lastCodeBlockStart > lastCodeBlockEnd) {
      return match; // Inside code block, keep it
    }
    return '';
  });
  
  // Remove export statements
  cleaned = cleaned.replace(/^export\s+.*?;?\s*$/gm, '');
  
  return cleaned;
}

/**
 * Remove frontmatter from markdown content
 */
export function removeFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n*/m, '');
}

/**
 * Clean excessive whitespace
 */
export function normalizeWhitespace(content: string): string {
  return content
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

/**
 * Normalize line endings to LF
 */
export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Remove HTML elements like iframes and embedded content
 */
export function removeHtmlEmbeds(content: string): string {
  let cleaned = content;
  
  // Remove div blocks with inline styles (YouTube embeds, etc.)
  cleaned = cleaned.replace(/<div\s+style=\{\{[^}]*\}\}[^>]*>[\s\S]*?<\/div>/gi, '');
  
  // Remove iframes
  cleaned = cleaned.replace(/<iframe[\s\S]*?\/>/gi, '');
  cleaned = cleaned.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  
  return cleaned;
}

// =============================================================================
// MINTLIFY COMPONENT CLEANING
// =============================================================================

/**
 * Convert Mintlify callout components to blockquotes
 */
export function convertCallouts(content: string): string {
  let cleaned = content;
  
  cleaned = cleaned.replace(/<Note>([\s\S]*?)<\/Note>/gi, '\n> **Note:** $1\n');
  cleaned = cleaned.replace(/<Warning>([\s\S]*?)<\/Warning>/gi, '\n> **Warning:** $1\n');
  cleaned = cleaned.replace(/<Tip>([\s\S]*?)<\/Tip>/gi, '\n> **Tip:** $1\n');
  cleaned = cleaned.replace(/<Info>([\s\S]*?)<\/Info>/gi, '\n> **Info:** $1\n');
  
  return cleaned;
}

/**
 * Convert Mintlify Accordion components to markdown
 */
export function convertAccordions(content: string): string {
  let cleaned = content;
  
  cleaned = cleaned.replace(/<Accordion\s+title="([^"]+)"[^>]*>/gi, '\n#### $1\n');
  cleaned = cleaned.replace(/<\/Accordion>/gi, '');
  cleaned = cleaned.replace(/<AccordionGroup[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/AccordionGroup>/gi, '');
  
  return cleaned;
}

/**
 * Remove Mintlify Card components (navigation elements)
 */
export function removeCards(content: string): string {
  let cleaned = content;
  
  cleaned = cleaned.replace(/<Card[^>]*>[\s\S]*?<\/Card>/gi, '');
  cleaned = cleaned.replace(/<CardGroup[^>]*>[\s\S]*?<\/CardGroup>/gi, '');
  
  return cleaned;
}

/**
 * Convert Mintlify Steps components
 */
export function convertSteps(content: string): string {
  let cleaned = content;
  
  cleaned = cleaned.replace(/<Steps>/gi, '');
  cleaned = cleaned.replace(/<\/Steps>/gi, '');
  cleaned = cleaned.replace(/<Step\s+title="([^"]+)"[^>]*>/gi, '\n**$1**\n');
  cleaned = cleaned.replace(/<\/Step>/gi, '');
  
  return cleaned;
}

/**
 * Remove wrapper components (Frame, Expandable, etc.)
 */
export function removeWrapperComponents(content: string): string {
  let cleaned = content;
  
  // Remove wrapper tags
  cleaned = cleaned.replace(/<(Frame|Expandable|ParamField|ResponseField|CodeGroup)[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/(Frame|Expandable|ParamField|ResponseField|CodeGroup)>/gi, '');
  
  // Remove Tabs wrapper (keeping content)
  cleaned = cleaned.replace(/<Tabs[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/Tabs>/gi, '');
  
  return cleaned;
}

/**
 * Remove remaining JSX-style tags
 */
export function removeJsxTags(content: string): string {
  let cleaned = content;
  
  // Self-closing tags
  cleaned = cleaned.replace(/<[A-Z][a-zA-Z]*[^>]*\/>/g, '');
  // Opening tags
  cleaned = cleaned.replace(/<[A-Z][a-zA-Z]*[^>]*>/g, '');
  // Closing tags
  cleaned = cleaned.replace(/<\/[A-Z][a-zA-Z]*>/g, '');
  
  return cleaned;
}

// =============================================================================
// FUMADOCS COMPONENT CLEANING
// =============================================================================

/**
 * Convert Fumadocs Callout components
 */
export function convertFumadocsCallouts(content: string): string {
  let cleaned = content;
  
  cleaned = cleaned.replace(/<Callout\s+title="([^"]+)"[^>]*>([\s\S]*?)<\/Callout>/gi, 
    (_, title, inner) => `\n> **${title}:** ${inner.trim()}\n`);
  cleaned = cleaned.replace(/<Callout[^>]*>([\s\S]*?)<\/Callout>/gi, 
    (_, inner) => `\n> ${inner.trim()}\n`);
  
  return cleaned;
}

/**
 * Convert Fumadocs Cards to bullet points
 */
export function convertFumadocsCards(content: string): string {
  let cleaned = content;
  
  // Remove Cards wrapper
  cleaned = cleaned.replace(/<Cards[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/Cards>/gi, '');
  
  // Convert Card to bullet points
  cleaned = cleaned.replace(/<Card\s+title="([^"]+)"[^>]*>([\s\S]*?)<\/Card>/gi, 
    (_, title, inner) => `- **${title}**: ${inner.trim()}`);
  cleaned = cleaned.replace(/<Card\s+title="([^"]+)"[^>]*\/>/gi, '- **$1**');
  
  return cleaned;
}

/**
 * Remove component previews and demos
 */
export function removeComponentPreviews(content: string): string {
  let cleaned = content;
  
  cleaned = cleaned.replace(/<PreviewComponents[^>]*>[\s\S]*?<\/PreviewComponents>/gi, '');
  cleaned = cleaned.replace(/<include[^>]*>[\s\S]*?<\/include>/gi, '[Code example - see documentation]');
  cleaned = cleaned.replace(/<[A-Z][a-zA-Z]*Demo\s*\/>/g, '');
  
  return cleaned;
}

// =============================================================================
// COMPOSITE CLEANING FUNCTIONS
// =============================================================================

/**
 * Full MDX cleaning for Mintlify docs (preserves Tab structure for detection)
 */
export function cleanMintlifyMdxPreserveTabs(content: string): string {
  let cleaned = content;
  
  cleaned = normalizeLineEndings(cleaned);
  cleaned = removeFrontmatter(cleaned);
  cleaned = removeImportsExports(cleaned);
  cleaned = removeWrapperComponents(cleaned);
  cleaned = convertAccordions(cleaned);
  cleaned = removeCards(cleaned);
  cleaned = convertCallouts(cleaned);
  cleaned = convertSteps(cleaned);
  cleaned = normalizeWhitespace(cleaned);
  
  return cleaned;
}

/**
 * Full MDX cleaning for Fumadocs (BillingSDK)
 */
export function cleanFumadocsMdx(content: string): string {
  let cleaned = content;
  
  cleaned = normalizeLineEndings(cleaned);
  cleaned = removeImportsExports(cleaned);
  cleaned = removeHtmlEmbeds(cleaned);
  cleaned = convertFumadocsCallouts(cleaned);
  cleaned = convertFumadocsCards(cleaned);
  cleaned = removeComponentPreviews(cleaned);
  cleaned = normalizeWhitespace(cleaned);
  
  return cleaned;
}

/**
 * Final cleanup - remove all remaining JSX tags
 */
export function finalCleanup(content: string): string {
  let cleaned = content;
  
  cleaned = normalizeLineEndings(cleaned);
  cleaned = removeJsxTags(cleaned);
  cleaned = normalizeWhitespace(cleaned);
  
  return cleaned;
}

