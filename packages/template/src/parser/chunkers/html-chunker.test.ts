import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { extractMainHtml, htmlToMarkdown, parseHTMLSource } from './html-chunker.js';
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

describe('parseHTMLSource sourceUrl resolution', () => {
  // Richer than SAMPLE so the markdown chunker reliably emits at least one chunk.
  const PAGE = `<!DOCTYPE html><html><head><title>Getting Started</title></head>
    <body><main>
      <h2>Install</h2>
      <p>Run npm install to begin. This is a longer paragraph of documentation
      content so the chunker has enough text to emit at least one chunk during
      this test. It describes the installation flow in some detail.</p>
      <pre><code>const x = 1;</code></pre>
    </main></body></html>`;
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function stage(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'html-chunker-'));
    tmpDirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return dir;
  }

  const source = (extra: Partial<SourceConfig> = {}): SourceConfig =>
    ({ name: 'docs', type: 'website', parser: 'html', ...extra }) as SourceConfig;

  it('uses the crawler URL map (preserving query strings, no spurious .html)', () => {
    const dir = stage({
      'docs/intro.html': PAGE,
      '.url-map.json': JSON.stringify({
        'docs/intro.html': 'https://docs.example.com/docs/intro?v=2',
      }),
    });

    const chunks = parseHTMLSource(source(), dir);
    expect(chunks.length).toBeGreaterThan(0);
    // Exact crawler URL — not the 404-y reconstruction.
    expect(chunks[0].metadata.sourceUrl).toBe('https://docs.example.com/docs/intro?v=2');
    expect(chunks.every(c => !c.metadata.sourceUrl?.endsWith('/docs/intro.html'))).toBe(true);
  });

  it('falls back to baseUrl reconstruction when no URL map is present', () => {
    const dir = stage({ 'guide.html': PAGE });
    const chunks = parseHTMLSource(source({ baseUrl: 'https://d.example.com' }), dir);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].metadata.sourceUrl).toBe('https://d.example.com/guide.html');
  });
});
