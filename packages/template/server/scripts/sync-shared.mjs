#!/usr/bin/env node
/**
 * Regenerate the vendored copy of the canonical shared search-core module.
 *
 * The Node server's Docker build context is the `server/` directory alone, so
 * it can't import across the package boundary. Instead we vendor a copy of the
 * canonical module (packages/template/src/search-core.ts) into
 * server/src/shared/ with a generated banner. A drift test fails CI if this
 * copy is stale, so the two never silently diverge.
 *
 * Usage: node scripts/sync-shared.mjs   (or: npm run sync:shared)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CANONICAL = resolve(here, '../../src/search-core.ts');
const VENDORED = resolve(here, '../src/shared/search-core.ts');

export const BANNER =
  '// AUTO-GENERATED — DO NOT EDIT BY HAND.\n' +
  '// Vendored copy of packages/template/src/search-core.ts (canonical source).\n' +
  '// Regenerate with: npm run sync:shared   (drift is guarded by a test).\n\n';

/** The exact expected contents of the vendored file for a given canonical body. */
export function renderVendored(canonicalSource) {
  return BANNER + canonicalSource;
}

export function readCanonical() {
  return readFileSync(CANONICAL, 'utf-8');
}

export function readVendored() {
  return readFileSync(VENDORED, 'utf-8');
}

export const PATHS = { CANONICAL, VENDORED };

function main() {
  const expected = renderVendored(readCanonical());
  mkdirSync(dirname(VENDORED), { recursive: true });
  writeFileSync(VENDORED, expected);
  console.log(`synced ${VENDORED}`);
}

// Only run when invoked directly (not when imported by the drift test).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
