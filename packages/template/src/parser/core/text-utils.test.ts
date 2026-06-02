import { describe, it, expect } from 'vitest';
import {
  cleanHeading,
  extractDescription,
  normalizeLineEndings,
  normalizeWhitespace,
  removeFrontmatter,
  convertCallouts,
  removeJsxTags,
} from './text-utils.js';

describe('cleanHeading', () => {
  it('strips inline code, bold, and italic markers', () => {
    expect(cleanHeading('`code` heading')).toBe('code heading');
    expect(cleanHeading('**bold** title')).toBe('bold title');
    expect(cleanHeading('*italic* title')).toBe('italic title');
  });

  it('converts markdown links to their text', () => {
    expect(cleanHeading('See [the docs](https://example.com)')).toBe('See the docs');
  });

  it('collapses newlines and extra whitespace', () => {
    expect(cleanHeading('Multi\nline   heading')).toBe('Multi line heading');
  });

  it('trims surrounding whitespace', () => {
    expect(cleanHeading('   padded   ')).toBe('padded');
  });
});

describe('extractDescription', () => {
  it('returns the first meaningful prose paragraph', () => {
    const md = `# Title\n\nThis is a meaningful first paragraph describing the thing.\n\nSecond paragraph.`;
    expect(extractDescription(md)).toBe(
      'This is a meaningful first paragraph describing the thing.'
    );
  });

  it('skips headings, lists, and code blocks', () => {
    const md = `# Heading\n\n- a list item that is reasonably long but skipped\n\nActual prose paragraph that should be selected here.`;
    expect(extractDescription(md)).toBe('Actual prose paragraph that should be selected here.');
  });

  it('truncates to maxLength with an ellipsis', () => {
    const long = 'x'.repeat(300);
    const md = `intro\n\n${long}`;
    const out = extractDescription(md, 50);
    expect(out.length).toBe(50);
    expect(out.endsWith('...')).toBe(true);
  });

  it('returns empty string when there is no prose', () => {
    expect(extractDescription('# Only\n\n## Headings')).toBe('');
  });
});

describe('normalizeLineEndings', () => {
  it('converts CRLF and CR to LF', () => {
    expect(normalizeLineEndings('a\r\nb\rc')).toBe('a\nb\nc');
  });
});

describe('normalizeWhitespace', () => {
  it('collapses many consecutive blank lines down to two newlines', () => {
    // 5 newlines -> >=4 rule maps to 3, then >=3 rule maps to 2 (one blank line).
    expect(normalizeWhitespace('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('strips trailing spaces and tabs on each line', () => {
    expect(normalizeWhitespace('a   \nb\t')).toBe('a\nb');
  });
});

describe('removeFrontmatter', () => {
  it('removes a leading YAML frontmatter block', () => {
    const md = `---\ntitle: Hello\n---\n# Body`;
    expect(removeFrontmatter(md).trim()).toBe('# Body');
  });

  it('leaves content without frontmatter unchanged', () => {
    expect(removeFrontmatter('# Body')).toBe('# Body');
  });
});

describe('convertCallouts', () => {
  it('converts Mintlify <Note> to a blockquote', () => {
    expect(convertCallouts('<Note>Heads up</Note>')).toContain('> **Note:** Heads up');
  });

  it('converts <Warning> to a blockquote', () => {
    expect(convertCallouts('<Warning>Careful</Warning>')).toContain('> **Warning:** Careful');
  });
});

describe('removeJsxTags', () => {
  it('does not throw and returns a string', () => {
    expect(typeof removeJsxTags('<Foo bar="baz" />text')).toBe('string');
  });
});
