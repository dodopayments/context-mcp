/**
 * Core Parser Utilities
 * 
 * Re-exports all shared utilities for easy importing.
 */

export {
  DEFAULT_CHUNK_CONFIG,
  getChunkConfigFromConfig,
} from './config.js';

// Text utilities
export {
  cleanHeading,
  extractDescription,
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
  parseIntoTree,
  extractFirstSubheading,
  splitLargeSection,
  getSectionSize,
  flattenSection,
  mergeHierarchicalSections,
} from './section-utils.js';

// Types
export type { Section, FlatSection } from './section-utils.js';

