export interface Scored {
  score: number;
  url?: string;
}

/** True for results indexed from GitHub (SDK and adapter READMEs), not from the docs site. */
function isGitHub(result: Scored): boolean {
  return result.url?.startsWith('https://github.com/') ?? false;
}

/**
 * Multiplies the score of GitHub results by `factor` and re-sorts, so a docs page
 * ranks above a README that covers the same topic about as well. A README still
 * wins when it is clearly the better match (for example, a tool documented only
 * in its README). In the 2026-11 search eval, "install the Python SDK" returned
 * the SDK README above /developer-resources/sdks/python.
 */
export function preferDocs<T extends Scored>(results: T[], factor: number): T[] {
  if (!(factor > 0 && factor < 1)) return results;
  return results
    .map((result, index) => ({
      result,
      index,
      score: isGitHub(result) ? result.score * factor : result.score,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(x => x.result);
}
