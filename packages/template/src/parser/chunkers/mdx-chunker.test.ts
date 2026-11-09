import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseMDXSource } from './mdx-chunker.js';
import type { SourceConfig } from '../../config/schema.js';

const body = 'Lorem ipsum dolor sit amet consectetur adipiscing elit. '.repeat(8);

function source(partial: Partial<SourceConfig>): SourceConfig {
  return {
    name: 'api-guides',
    type: 'local',
    parser: 'mdx',
    baseUrl: 'https://docs.example.com/api-reference',
    skipDirs: [],
    skipFiles: [],
    ...partial,
  } as SourceConfig;
}

describe('parseMDXSource skipOpenApiPages', () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-chunker-'));
    fs.writeFileSync(
      path.join(dir, 'error-codes.mdx'),
      `---\ntitle: Error codes\n---\n\n## Codes\n\n${body}`
    );
    fs.writeFileSync(
      path.join(dir, 'create-payment.mdx'),
      `---\ntitle: Create payment\nopenapi: post /payments\n---\n\n## Notes\n\n${body}`
    );
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const pages = (s: SourceConfig) =>
    [...new Set(parseMDXSource(s, dir).map(c => c.metadata.sourceUrl))].sort();

  it('indexes every page by default', () => {
    expect(pages(source({}))).toEqual([
      'https://docs.example.com/api-reference/create-payment',
      'https://docs.example.com/api-reference/error-codes',
    ]);
  });

  it('skips pages with openapi frontmatter when set', () => {
    expect(pages(source({ skipOpenApiPages: true }))).toEqual([
      'https://docs.example.com/api-reference/error-codes',
    ]);
  });
});
