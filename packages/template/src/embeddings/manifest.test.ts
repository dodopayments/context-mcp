import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChunkConfig, DocChunk } from '../types/index.js';
import {
  createIndexManifest,
  createIndexedChunk,
  diffIndexManifest,
  type EmbeddingSignature,
} from './manifest.js';

const chunking: ChunkConfig = {
  maxChunkSize: 2000,
  minChunkSize: 250,
  idealChunkSize: 1000,
};

const embedding: EmbeddingSignature = {
  provider: 'openai',
  model: 'text-embedding-3-large',
  dimensions: 3072,
};

test('unchanged chunks are skipped', () => {
  const indexed = [indexChunk(makeChunk('docs/page#0', 'Original content'), 'docs')];
  const manifest = createIndexManifest({
    indexedChunks: indexed,
    processedSourceNames: ['docs'],
    indexName: 'docs-index',
    embedding,
    chunking,
  });

  const diff = diffIndexManifest(manifest, indexed, ['docs'], embedding, chunking);

  assert.equal(diff.added.length, 0);
  assert.equal(diff.updated.length, 0);
  assert.equal(diff.unchanged.length, 1);
  assert.equal(diff.deleted.length, 0);
});

test('changed hashes become updates', () => {
  const previous = [indexChunk(makeChunk('docs/page#0', 'Original content'), 'docs')];
  const manifest = createIndexManifest({
    indexedChunks: previous,
    processedSourceNames: ['docs'],
    indexName: 'docs-index',
    embedding,
    chunking,
  });
  const current = [indexChunk(makeChunk('docs/page#0', 'Changed content'), 'docs')];

  const diff = diffIndexManifest(manifest, current, ['docs'], embedding, chunking);

  assert.equal(diff.added.length, 0);
  assert.equal(diff.updated.length, 1);
  assert.equal(diff.unchanged.length, 0);
  assert.equal(diff.deleted.length, 0);
});

test('missing prior chunks become deletes for processed sources', () => {
  const previous = [
    indexChunk(makeChunk('docs/page#0', 'Original content'), 'docs'),
    indexChunk(makeChunk('docs/page#1', 'Removed content'), 'docs'),
  ];
  const manifest = createIndexManifest({
    indexedChunks: previous,
    processedSourceNames: ['docs'],
    indexName: 'docs-index',
    embedding,
    chunking,
  });

  const diff = diffIndexManifest(manifest, [previous[0]], ['docs'], embedding, chunking);

  assert.equal(diff.added.length, 0);
  assert.equal(diff.updated.length, 0);
  assert.equal(diff.unchanged.length, 1);
  assert.equal(diff.deleted.length, 1);
  assert.equal(diff.deleted[0].rawId, 'docs/page#1');
});

test('source-scoped manifest updates preserve unprocessed sources', () => {
  const docsChunk = indexChunk(makeChunk('docs/page#0', 'Docs content'), 'docs');
  const apiChunk = indexChunk(makeChunk('api/get-payment#0', 'API content'), 'api');
  const manifest = createIndexManifest({
    indexedChunks: [docsChunk, apiChunk],
    processedSourceNames: ['docs', 'api'],
    indexName: 'docs-index',
    embedding,
    chunking,
  });
  const changedDocsChunk = indexChunk(makeChunk('docs/page#0', 'Changed docs content'), 'docs');

  const updatedManifest = createIndexManifest({
    previousManifest: manifest,
    indexedChunks: [changedDocsChunk],
    processedSourceNames: ['docs'],
    indexName: 'docs-index',
    embedding,
    chunking,
  });

  assert.equal(Object.keys(updatedManifest.chunks).length, 2);
  assert.ok(updatedManifest.chunks[changedDocsChunk.recordId]);
  assert.ok(updatedManifest.chunks[apiChunk.recordId]);
});

test('embedding signature changes force updates', () => {
  const indexed = [indexChunk(makeChunk('docs/page#0', 'Original content'), 'docs')];
  const manifest = createIndexManifest({
    indexedChunks: indexed,
    processedSourceNames: ['docs'],
    indexName: 'docs-index',
    embedding,
    chunking,
  });
  const newEmbedding = { ...embedding, model: 'text-embedding-3-small' };
  const current = [
    createIndexedChunk(
      makeChunk('docs/page#0', 'Original content'),
      'docs',
      newEmbedding,
      chunking
    ),
  ];

  const diff = diffIndexManifest(manifest, current, ['docs'], newEmbedding, chunking);

  assert.equal(diff.added.length, 0);
  assert.equal(diff.updated.length, 1);
  assert.equal(diff.unchanged.length, 0);
  assert.equal(diff.deleted.length, 0);
});

function indexChunk(chunk: DocChunk, sourceName: string) {
  return createIndexedChunk(chunk, sourceName, embedding, chunking);
}

function makeChunk(id: string, content: string): DocChunk {
  return {
    id,
    documentPath: `${id.split('#')[0]}.mdx`,
    documentTitle: 'Test Document',
    category: 'docs',
    heading: 'Test Heading',
    content,
    metadata: {
      description: 'Test description',
      sourceUrl: 'https://example.com/docs',
    },
  };
}
