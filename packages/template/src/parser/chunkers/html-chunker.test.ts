import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { extractMainHtml, htmlToMarkdown, findHtmlFiles, parseHTMLSource } from './html-chunker.js';
import type { SourceConfig } from '../../config/schema.js';

const SAMPLE = `<!DOCTYPE html>
<html>
  <head><title>Getting Started</title></head>
  <body>
    <nav>NAV LINKS</nav>
    <header>SITE HEADER</header>
    <main>
      <h2>Install</h2>
      <p>Run <code>npm install</code> to begin.</p>
      <pre><code>const x = 1;</code></pre>
      <ul><li>First</li><li>Second</li></ul>
    </main>
    <footer>SITE FOOTER</footer>
    <script>console.log('tracking')</script>
  </body>
</html>`;

describe('extractMainHtml', () => {
  it('extracts the title from <title>', () => {
    expect(extractMainHtml(SAMPLE).title).toBe('Getting Started');
  });

  it('removes nav, header, footer, and script boilerplate', () => {
    const { contentHtml } = extractMainHtml(SAMPLE);
    expect(contentHtml).not.toContain('NAV LINKS');
    expect(contentHtml).not.toContain('SITE HEADER');
    expect(contentHtml).not.toContain('SITE FOOTER');
    expect(contentHtml).not.toContain('tracking');
  });

  it('keeps the main content', () => {
    expect(extractMainHtml(SAMPLE).contentHtml).toContain('Install');
  });

  it('falls back to <h1> for the title when <title> is absent', () => {
    const html = '<body><h1>Fallback Title</h1><main><p>hi</p></main></body>';
    expect(extractMainHtml(html).title).toBe('Fallback Title');
  });

  // Guard the main-content fallback chain so a parser-lib regression in any
  // selector is caught. Each variant has no <main>/<article>, forcing the next
  // selector in MAIN_CONTENT_SELECTORS (or the <body> fallback) to be used.
  it.each([
    [
      '[role="main"]',
      '<body><nav>NAV</nav><div role="main"><p>ROLE_MAIN_BODY</p></div></body>',
      'ROLE_MAIN_BODY',
    ],
    [
      '#content',
      '<body><nav>NAV</nav><div id="content"><p>ID_CONTENT_BODY</p></div></body>',
      'ID_CONTENT_BODY',
    ],
    [
      '.content',
      '<body><nav>NAV</nav><div class="content"><p>CLASS_CONTENT_BODY</p></div></body>',
      'CLASS_CONTENT_BODY',
    ],
  ])('extracts main content via the %s fallback selector', (_label, html, expected) => {
    const { contentHtml } = extractMainHtml(html);
    expect(contentHtml).toContain(expected);
    expect(contentHtml).not.toContain('NAV');
  });

  it('falls back to <body> when no known content container exists', () => {
    const html = '<body><p>PLAIN_BODY_CONTENT</p></body>';
    expect(extractMainHtml(html).contentHtml).toContain('PLAIN_BODY_CONTENT');
  });
});

describe('htmlToMarkdown', () => {
  it('produces an H1 from the title and converts the body to Markdown', () => {
    const { title, markdown } = htmlToMarkdown(SAMPLE);
    expect(title).toBe('Getting Started');
    expect(markdown).toContain('# Getting Started');
    expect(markdown).toContain('## Install');
  });

  it('preserves fenced code blocks', () => {
    const { markdown } = htmlToMarkdown(SAMPLE);
    expect(markdown).toContain('```');
    expect(markdown).toContain('const x = 1;');
  });

  it('converts inline code and lists', () => {
    const { markdown } = htmlToMarkdown(SAMPLE);
    expect(markdown).toContain('`npm install`');
    expect(markdown).toContain('First');
    expect(markdown).toContain('Second');
  });

  it('does not leak boilerplate into the markdown', () => {
    const { markdown } = htmlToMarkdown(SAMPLE);
    expect(markdown).not.toContain('NAV LINKS');
    expect(markdown).not.toContain('SITE FOOTER');
  });
});

describe('findHtmlFiles', () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function stage(files: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'html-find-'));
    tmpDirs.push(dir);
    for (const rel of files) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, '<html><body><p>x</p></body></html>');
    }
    return dir;
  }

  it('finds .html/.htm files recursively', () => {
    const dir = stage(['a.html', 'sub/b.htm', 'sub/deep/c.html', 'notes.txt']);
    const found = findHtmlFiles(dir, [], []).sort();
    expect(found).toEqual(
      ['a.html', 'sub/b.htm', 'sub/deep/c.html'].map(p => p.split('/').join(path.sep))
    );
  });

  it('skips dot-directories (e.g. .git) by design', () => {
    const dir = stage(['ok.html', '.git/config.html', '.hidden/secret.html']);
    const found = findHtmlFiles(dir, [], []);
    expect(found).toEqual(['ok.html']);
  });

  it('honors skipDirs and skipFiles (case-insensitive)', () => {
    const dir = stage(['keep.html', 'Vendor/skip.html', 'IGNORE.html']);
    const found = findHtmlFiles(dir, ['vendor'], ['ignore.html']);
    expect(found).toEqual(['keep.html']);
  });
});

describe('parseHTMLSource resilience (adversarial)', () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function stageDir(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'html-src-'));
    tmpDirs.push(dir);
    for (const [rel, html] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, html);
    }
    return dir;
  }

  // A perfectly good doc with enough text to survive minChunkSize filtering.
  const goodDoc = (title: string) =>
    `<html><head><title>${title}</title></head><body><main>` +
    `<h2>Section</h2><p>${'This is real documentation content that must be indexed. '.repeat(20)}</p>` +
    `</main></body></html>`;

  // Pathologically deep nesting overflows node-html-parser's recursive
  // innerHTML walk (RangeError: Maximum call stack size exceeded).
  const deeplyNested = () => {
    const depth = 4000;
    return `<body><main>${'<div>'.repeat(depth)}X${'</div>'.repeat(depth)}</main></body>`;
  };

  it('a single deeply-nested file does NOT abort the whole source (no silent data loss)', () => {
    const dir = stageDir({
      'a-good.html': goodDoc('Alpha Guide'),
      'b-evil.html': deeplyNested(),
      'c-good.html': goodDoc('Charlie Guide'),
    });
    const source = {
      name: 'demo',
      skipDirs: [],
      skipFiles: [],
      language: 'unknown',
    } as unknown as SourceConfig;

    // Silence the expected per-file warning.
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Before the fix this threw RangeError and dropped EVERY good file's chunks.
    const chunks = parseHTMLSource(source, dir);

    // Both good files must still be indexed.
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const docs = new Set(chunks.map(c => c.documentPath));
    expect(docs.size).toBeGreaterThanOrEqual(2);
  });

  it('does NOT emit colliding ids/paths across multiple HTML pages (silent data loss)', () => {
    const page = (title: string) =>
      `<html><head><title>${title}</title></head><body><main>` +
      `<h2>Section</h2><p>${'Indexable documentation content goes here. '.repeat(20)}</p>` +
      `</main></body></html>`;
    const dir = stageDir({
      'page1.html': page('Page One'),
      'page2.html': page('Page Two'),
      'sub/page3.html': page('Page Three'),
    });
    const source = {
      name: 'demo',
      skipDirs: [],
      skipFiles: [],
      language: 'unknown',
    } as unknown as SourceConfig;

    const chunks = parseHTMLSource(source, dir);

    // Each of the 3 pages should yield at least one chunk.
    expect(chunks.length).toBeGreaterThanOrEqual(3);

    // Ids are the upsert key -> collisions silently overwrite. They MUST be unique.
    const ids = chunks.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    // documentPath must distinguish the source page.
    const paths = new Set(chunks.map(c => c.documentPath));
    expect(paths.size).toBeGreaterThanOrEqual(3);
  });
});
