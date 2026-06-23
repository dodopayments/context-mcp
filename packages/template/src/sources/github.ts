/**
 * GitHub Source Fetcher
 *
 * Clones repositories from GitHub for documentation parsing. Supports both
 * public and private repositories (via GITHUB_TOKEN).
 *
 * This is a thin adapter over the shared git fetcher in `git-source.ts`; the
 * only GitHub-specific detail is the `x-access-token:<token>` userinfo form and
 * the fixed `github.com` host. See `git-source.ts` for the security model
 * (execFileSync, input allowlists, hard-fail token scrubbing).
 */

import { SourceConfig } from '../config/schema.js';
import {
  type FetchedSource,
  type GitProviderSpec,
  buildGitCloneUrl,
  validateGitInput,
  scrubGitRemote,
  fetchGitSource,
} from './git-source.js';

export type { FetchedSource };

const GITHUB_HOST = 'github.com';

/** GitHub-specific behavior for the shared git fetcher. */
const GITHUB_SPEC: GitProviderSpec = {
  name: 'GitHub',
  tokenEnvVar: 'GITHUB_TOKEN',
  // GitHub accepts the `x-access-token:<token>` userinfo form for HTTPS auth.
  tokenUserinfo: token => `x-access-token:${token}`,
  localDirPrefix: '',
  repositoryHint: '"owner/repo"',
};

/**
 * Build a clone URL for GitHub, embedding a token for private repos.
 * Kept for backwards compatibility and unit tests.
 */
export function buildCloneUrl(repository: string, token: string | undefined): string {
  return buildGitCloneUrl(GITHUB_SPEC, GITHUB_HOST, repository, token);
}

/**
 * Validate the user-supplied GitHub fields. Rejects values containing shell
 * metacharacters, leading dashes (git option injection), or path traversal.
 */
export function validateGitHubInput(repository: string, branch: string): void {
  validateGitInput(GITHUB_SPEC, GITHUB_HOST, repository, branch);
}

/** Scrub a token-bearing remote back to the plain HTTPS URL (hard-fails on failure). */
export function scrubRemote(localPath: string, repository: string): void {
  scrubGitRemote(GITHUB_SPEC, localPath, GITHUB_HOST, repository);
}

/**
 * Clone a GitHub repository for parsing.
 *
 * Config fields used:
 * - repository: "owner/repo" (required)
 * - branch: defaults to "main"
 * - path: optional subdirectory within the repo
 */
export async function fetchGitHubSource(source: SourceConfig): Promise<FetchedSource> {
  return fetchGitSource(GITHUB_SPEC, source, GITHUB_HOST);
}
