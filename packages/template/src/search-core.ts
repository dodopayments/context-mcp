/**
 * Shared, runtime-agnostic search helpers.
 *
 * CANONICAL SOURCE. This module is intentionally free of any runtime-specific
 * imports (no Pinecone client, no OpenAI SDK, no Node or Workers globals) so it
 * can be consumed by BOTH deployment targets:
 *   - the Cloudflare worker  (packages/template/cloudflare-worker)
 *   - the Node server         (packages/template/server)
 *
 * The Node server keeps a *vendored copy* of this file (server/src/shared/
 * search-core.ts) because its Docker build context is the `server/` directory
 * alone — it cannot import across the package boundary. That copy is generated
 * by `server`'s `sync:shared` script and guarded by a drift test, so the two
 * never silently diverge. Edit THIS file; the copy is regenerated.
 */

export interface SearchResult {
  score: number;
  title: string;
  heading: string;
  content: string;
  url?: string;
  method?: string;
  path?: string;
  language?: string;
}

/** Clamp a requested result count into [1, maxTopK], defaulting when unset. */
export function clampLimit(
  limit: number | undefined,
  defaultTopK: number,
  maxTopK: number
): number {
  return Math.min(Math.max(1, limit ?? defaultTopK), maxTopK);
}

/** Round a raw similarity score to 2 decimal places (shared display rule). */
export function roundScore(score: number | undefined): number {
  return Math.round((score || 0) * 100) / 100;
}

/**
 * Map a vector-DB match (score + metadata bag) into a SearchResult. Kept here so
 * both runtimes shape results from the same field names identically.
 */
export function mapMatchToSearchResult(
  score: number | undefined,
  metadata: Record<string, unknown> | undefined
): SearchResult {
  const m = metadata ?? {};
  return {
    score: roundScore(score),
    title: String(m.documentTitle || ''),
    heading: String(m.heading || ''),
    content: String(m.content || ''),
    url: m.sourceUrl as string | undefined,
    method: m.method as string | undefined,
    path: m.path as string | undefined,
    language: m.language as string | undefined,
  };
}

/** Format search results as Markdown for the MCP tool / REST response. */
export function formatResults(results: SearchResult[], query: string, serverName: string): string {
  const lines: string[] = [
    `# ${serverName} Documentation`,
    `> Query: ${query}`,
    `> Results: ${results.length}`,
    '',
  ];
  const separator = '-'.repeat(40);

  for (const result of results) {
    lines.push(separator);
    lines.push(`## ${result.title}`);
    if (result.url) lines.push(`Source: ${result.url}`);
    if (result.method && result.path) lines.push(`API: ${result.method} ${result.path}`);
    if (result.language) lines.push(`Language: ${result.language}`);
    lines.push('');
    lines.push(result.content);
    lines.push('');
  }

  return lines.join('\n');
}
