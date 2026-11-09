export interface PageRef {
  title: string;
  url?: string;
  method?: string;
  path?: string;
}

/** The page a result comes from: its URL without the #anchor, else its API operation, else its title. */
function pageKey(result: PageRef): string {
  if (result.url) return result.url.split('#')[0].replace(/\/$/, '');
  if (result.method && result.path) return `${result.method} ${result.path}`;
  return result.title;
}

/**
 * Keeps the best-ranked chunk of each page, in rank order, up to `count`.
 * Without this, several chunks of one page filled most results (73 of 150 in the
 * 2026-11 search eval).
 */
export function onePerPage<T extends PageRef>(results: T[], count: number): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const result of results) {
    const key = pageKey(result);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(result);
    if (unique.length === count) break;
  }
  return unique;
}
