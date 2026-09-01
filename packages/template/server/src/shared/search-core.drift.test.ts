import { describe, it, expect } from 'vitest';
// @ts-expect-error - .mjs helper has no type declarations
import { renderVendored, readCanonical, readVendored, PATHS } from '../../scripts/sync-shared.mjs';

/**
 * Guard: the vendored copy of search-core.ts must exactly match the canonical
 * source (plus the generated banner). If this fails, run `npm run sync:shared`.
 *
 * This is what enforces the "single source of truth" — the worker and the Node
 * server can't silently drift, since any edit to the canonical module without
 * re-syncing breaks the build.
 */
describe('shared search-core vendoring', () => {
  it('vendored copy is in sync with the canonical source', () => {
    const expected = renderVendored(readCanonical() as string);
    const actual = readVendored() as string;
    expect(
      actual,
      `Vendored ${PATHS.VENDORED} is stale. Run \`npm run sync:shared\` to regenerate.`
    ).toBe(expected);
  });
});
