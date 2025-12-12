/**
 * Core Parser Utilities
 * 
 * Re-exports all shared utilities for easy importing.
 */

export {
  DEFAULT_CHUNK_CONFIG,
  SDK_CHUNK_CONFIG,
  BILLINGSDK_CHUNK_CONFIG,
  OPENAPI_CHUNK_CONFIG,
  DOCS_CHUNK_CONFIG,
  DOCS_BASE_URL,
  BILLINGSDK_DOCS_URL,
  TEMP_DIR,
  DATA_DIR,
  getChunkConfig,
  ensureDir,
  cloneRepo,
  extractRepoInfo,
} from './config.js';

// Text utilities
export {
  cleanHeading,
  extractDescription,
  removeImportsExports,
  removeFrontmatter,
  normalizeWhitespace,
  normalizeLineEndings,
  removeHtmlEmbeds,
  convertCallouts,
  convertAccordions,
  removeCards,
  convertSteps,
  removeWrapperComponents,
  removeJsxTags,
  convertFumadocsCallouts,
  convertFumadocsCards,
  removeComponentPreviews,
  cleanMintlifyMdxPreserveTabs,
  cleanFumadocsMdx,
  finalCleanup,
} from './text-utils.js';

// Section utilities
export {
  splitByCodeBlocks,
  splitByCodeBlocksWithParagraphs,
  parseIntoSections,
  parseIntoTree,
  mergeSections,
  extractFirstSubheading,
  splitLargeSection,
  getSectionSize,
  flattenSection,
  mergeHierarchicalSections,
} from './section-utils.js';

// Types
export type { Section, FlatSection } from './section-utils.js';

