/**
 * GitLab Source Fetcher
 *
 * Clones repositories from GitLab (gitlab.com or a self-hosted instance) for
 * documentation parsing. Supports private repositories via GITLAB_TOKEN.
 *
 * This is a thin adapter over the shared git fetcher in `git-source.ts`; the
 * GitLab-specific details are the `oauth2:<token>` userinfo form, the
 * configurable host (`gitlabHost`, default gitlab.com) for self-hosted
 * instances, and nested-subgroup repository paths. See `git-source.ts` for the
 * security model (execFileSync, input allowlists, hard-fail token scrubbing).
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

const DEFAULT_GITLAB_HOST = 'gitlab.com';

/** GitLab-specific behavior for the shared git fetcher. */
const GITLAB_SPEC: GitProviderSpec = {
  name: 'GitLab',
  tokenEnvVar: 'GITLAB_TOKEN',
  // GitLab uses the `oauth2:<token>` userinfo form for HTTPS token auth.
  tokenUserinfo: token => `oauth2:${token}`,
  localDirPrefix: 'gitlab-',
  repositoryHint: '"group/project" or "group/subgroup/project"',
};

/**
 * Build a clone URL for GitLab, embedding a token for private repos.
 * Kept for backwards compatibility and unit tests.
 */
export function buildCloneUrl(host: string, repository: string, token: string | undefined): string {
  return buildGitCloneUrl(GITLAB_SPEC, host, repository, token);
}

/**
 * Validate the user-supplied GitLab fields. Rejects values containing shell
 * metacharacters, leading dashes (git option injection), or path traversal.
 */
export function validateGitLabInput(host: string, repository: string, branch: string): void {
  validateGitInput(GITLAB_SPEC, host, repository, branch);
}

/** Scrub a token-bearing remote back to the plain HTTPS URL (hard-fails on failure). */
export function scrubRemote(localPath: string, host: string, repository: string): void {
  scrubGitRemote(GITLAB_SPEC, localPath, host, repository);
}

/**
 * Clone a GitLab repository for parsing.
 *
 * Config fields used:
 * - repository: "group/project" or "group/subgroup/project" (required)
 * - branch: defaults to "main"
 * - path: optional subdirectory within the repo
 * - gitlabHost: optional self-hosted host (default gitlab.com)
 */
export async function fetchGitLabSource(source: SourceConfig): Promise<FetchedSource> {
  const host = source.gitlabHost || DEFAULT_GITLAB_HOST;
  return fetchGitSource(GITLAB_SPEC, source, host);
}
