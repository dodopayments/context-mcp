/**
 * HTML Documentation Chunker
 *
 * Parser for raw .html / .htm documentation files. Extracts the main content,
 * strips boilerplate (nav, header, footer, scripts, styles), converts to
 * Markdown, and reuses the markdown chunking pipeline so HTML docs produce the
 * same high-quality chunks as native Markdown.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse as parseHtml, type HTMLElement } from 'node-html-parser';
import TurndownService from 'turndown';
import { DocChunk, ChunkConfig } from '../../types/index.js';
import { SourceConfig } from '../../config/schema.js';
import { DEFAULT_CHUNK_CONFIG } from '../core/index.js';
import { parseMarkdownFile } from './markdown-chunker.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const HTML_EXTENSIONS = new Set(['.html', '.htm']);

// Elements that are almost never primary documentation content.
const BOILERPLATE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'iframe',
  'svg',
];

// Preferred containers for the "main" content, in priority order.
const MAIN_CONTENT_SELECTORS = ['main', 'article', '[role="main"]', '#content', '.content'];

// =============================================================================
// FILE DISCOVERY
// =============================================================================

export function findHtmlFiles(
  dir: string,
  skipDirs: string[],
  skipFiles: string[],
  baseDir = dir
): string[] {
  const files: string[] = [];
  const skipDirsSet = new Set(skipDirs.map(d => d.toLowerCase()));
  const skipFilesSet = new Set(skipFiles.map(f => f.toLowerCase()));

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Intentionally skip dot-directories (e.g. .git, .svn, .next) so we never
      // descend into VCS/build metadata. (Note: the markdown chunker doesn't do
      // this today — a known sibling-parser inconsistency tracked separately.)
      if (entry.name.startsWith('.') || skipDirsSet.has(entry.name.toLowerCase())) continue;
      files.push(...findHtmlFiles(fullPath, skipDirs, skipFiles, baseDir));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (HTML_EXTENSIONS.has(ext) && !skipFilesSet.has(entry.name.toLowerCase())) {
        files.push(path.relative(baseDir, fullPath));
      }
    }
  }

  return files;
}

// =============================================================================
// HTML -> MARKDOWN
// =============================================================================

let turndown: TurndownService | undefined;

function getTurndown(): TurndownService {
  if (!turndown) {
    turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
  }
  return turndown;
}

/**
 * Extract the page title and main-content HTML from a raw HTML string.
 */
export function extractMainHtml(html: string): { title: string; contentHtml: string } {
  const root = parseHtml(html, { comment: false });

  // Title: prefer <title>, fall back to first <h1>.
  const title =
    root.querySelector('title')?.text?.trim() || root.querySelector('h1')?.text?.trim() || '';

  // Remove boilerplate before extracting content.
  for (const selector of BOILERPLATE_SELECTORS) {
    root.querySelectorAll(selector).forEach(el => el.remove());
  }

  // Find the best main-content container, else fall back to <body> or root.
  let container: HTMLElement | null = null;
  for (const selector of MAIN_CONTENT_SELECTORS) {
    container = root.querySelector(selector);
    if (container) break;
  }
  if (!container) container = root.querySelector('body') ?? root;

  return { title, contentHtml: container.innerHTML };
}

/**
 * Convert a raw HTML document into Markdown (title as H1 + converted body).
 */
export function htmlToMarkdown(html: string): { title: string; markdown: string } {
  const { title, contentHtml } = extractMainHtml(html);
  const body = getTurndown().turndown(contentHtml).trim();
  const markdown = title ? `# ${title}\n\n${body}` : body;
  return { title, markdown };
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Parse HTML documentation from a source by converting each .html file to
 * Markdown and running it through the markdown chunker.
 */
export function parseHTMLSource(
  source: SourceConfig,
  localPath: string,
  chunkConfig: ChunkConfig = DEFAULT_CHUNK_CONFIG
): DocChunk[] {
  const stat = fs.statSync(localPath);

  // A source may point at a single file (e.g. a URL-fetched page) or a dir.
  const files: string[] = stat.isFile()
    ? [path.basename(localPath)]
    : findHtmlFiles(localPath, source.skipDirs, source.skipFiles);
  const rootDir = stat.isFile() ? path.dirname(localPath) : localPath;

  if (files.length === 0) return [];

  const allChunks: DocChunk[] = [];
  const contextName = source.displayName || source.name;
  const language = source.language || 'unknown';

  for (const file of files) {
    const fullPath = path.join(rootDir, file);
    let html: string;
    try {
      html = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const { markdown } = htmlToMarkdown(html);
    if (!markdown.trim()) continue;

    // Map the .html file to a clean .html URL on the docs site.
    const sourceUrl = source.baseUrl ? `${source.baseUrl.replace(/\/$/, '')}/${file}` : '';

    const dirName = path.dirname(file);
    const fileContextName =
      dirName !== '.' ? `${contextName}/${path.basename(dirName)}` : contextName;

    const chunks = parseMarkdownFile(
      markdown,
      sourceUrl,
      fileContextName,
      // Use a .md filename so the markdown chunker treats it as generic docs.
      file.replace(/\.html?$/i, '.md'),
      language,
      chunkConfig
    );
    allChunks.push(...chunks);
  }

  return allChunks;
}
