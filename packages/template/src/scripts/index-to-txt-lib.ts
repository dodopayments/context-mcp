/**
 * Pure logic for the index-to-txt script: argument parsing, path resolution,
 * the overwrite guard, and chunk formatting. Extracted so it can be unit-tested
 * without the filesystem or process.
 */

import * as path from 'path';

export interface TxtArgs {
  input?: string;
  output?: string;
  force: boolean;
  help: boolean;
}

/** Parse argv (without the leading `node script` entries). */
export function parseTxtArgs(argv: string[]): TxtArgs {
  const args: TxtArgs = { force: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--force' || arg === '-f') {
      args.force = true;
    } else if (arg === '--input' || arg === '-i') {
      args.input = argv[++i];
    } else if (arg === '--output' || arg === '-o') {
      args.output = argv[++i];
    }
  }
  return args;
}

/**
 * Resolve the input/output paths: an explicit flag is resolved against CWD,
 * otherwise the default lives in `dataDir`.
 */
export function resolvePaths(
  args: Pick<TxtArgs, 'input' | 'output'>,
  dataDir: string
): { inputPath: string; outputPath: string } {
  return {
    inputPath: args.input ? path.resolve(args.input) : path.join(dataDir, 'chunks-index.json'),
    outputPath: args.output ? path.resolve(args.output) : path.join(dataDir, 'chunks-full.txt'),
  };
}

/**
 * Whether to refuse writing: true when the output already exists and --force
 * was not passed.
 */
export function shouldRefuseOverwrite(outputExists: boolean, force: boolean): boolean {
  return outputExists && !force;
}

export interface TxtChunkMetadata {
  sourceUrl?: string;
  language?: string;
  method?: string;
  path?: string;
}

export interface TxtChunk {
  documentTitle: string;
  heading: string;
  content: string;
  metadata: TxtChunkMetadata;
}

/**
 * Format chunks into the plain-text format used by the worker's /llms endpoint.
 */
export function formatChunks(chunks: TxtChunk[]): string {
  const lines: string[] = ['# Documentation', `> Total chunks: ${chunks.length}`, ''];
  const separator = '-'.repeat(40);

  for (const chunk of chunks) {
    lines.push(separator);
    lines.push(`## ${chunk.documentTitle}`);

    if (chunk.heading && chunk.heading !== chunk.documentTitle) {
      lines.push(`Heading: ${chunk.heading}`);
    }
    if (chunk.metadata.sourceUrl) {
      lines.push(`Source: ${chunk.metadata.sourceUrl}`);
    }
    if (chunk.metadata.method && chunk.metadata.path) {
      lines.push(`API: ${chunk.metadata.method} ${chunk.metadata.path}`);
    }
    if (chunk.metadata.language) {
      lines.push(`Language: ${chunk.metadata.language}`);
    }
    lines.push('');
    lines.push(chunk.content || '');
    lines.push('');
  }

  return lines.join('\n');
}
