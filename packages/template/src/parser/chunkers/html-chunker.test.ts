import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { extractMainHtml, htmlToMarkdown, findHtmlFiles } from './html-chunker.js';

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
