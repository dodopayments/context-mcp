import { describe, it, expect } from 'vitest';
import { extractMainHtml, htmlToMarkdown } from './html-chunker.js';

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
