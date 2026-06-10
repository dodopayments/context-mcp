import { describe, it, expect } from 'vitest';
import { splitByCodeBlocks } from './section-utils.js';

describe('splitByCodeBlocks', () => {
  it('returns a single part when there is no code block', () => {
    expect(splitByCodeBlocks('just some text')).toEqual(['just some text']);
  });

  it('separates fenced code blocks from surrounding text', () => {
    const input = 'before\n```js\nconst x = 1;\n```\nafter';
    const parts = splitByCodeBlocks(input);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('before\n');
    expect(parts[1]).toBe('```js\nconst x = 1;\n```');
    expect(parts[2]).toBe('\nafter');
  });

  it('keeps a leading code block as the first part', () => {
    const input = '```\ncode\n```\ntrailing';
    const parts = splitByCodeBlocks(input);
    expect(parts[0]).toBe('```\ncode\n```');
    expect(parts[1]).toBe('\ntrailing');
  });

  it('handles multiple code blocks', () => {
    const input = 'a\n```\n1\n```\nb\n```\n2\n```';
    const parts = splitByCodeBlocks(input);
    const codeParts = parts.filter(p => p.startsWith('```'));
    expect(codeParts).toHaveLength(2);
  });

  it('reconstructs the original content when joined', () => {
    const input = 'x\n```\ny\n```\nz';
    expect(splitByCodeBlocks(input).join('')).toBe(input);
  });
});
