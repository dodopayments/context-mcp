/**
 * GitLab Source Fetcher
 *
 * Clones repositories from GitLab (gitlab.com or a self-hosted instance) for
 * documentation parsing. Supports private repositories via GITLAB_TOKEN.
 */

import { execFileSync } from 'child_process';
import { existsSync, rmSync, mkdirSync } from 'fs';
import * as path from 'path';
import { SourceConfig } from '../config/schema.js';
import type { FetchedSource } from './github.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const TEMP_DIR = path.join(process.cwd(), '.temp-repos');
const DEFAULT_GITLAB_HOST = 'gitlab.com';

// Conservative allowlists. These are defense-in-depth on top of using
// execFileSync (no shell), so even non-shell git arg confusion is prevented.
const HOST_RE = /^[a-zA-Z0-9.-]+(:\d+)?$/;
const REPOSITORY_RE = /^[a-zA-Z0-9._-]+(\/[a-zA-Z0-9._-]+)+$/;
const BRANCH_RE = /^[a-zA-Z0-9._\/-]+$/;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build a clone URL for GitLab, embedding a token for private repos.
 * GitLab uses the `oauth2:<token>` userinfo form for HTTPS token auth.
 */
export function buildCloneUrl(host: string, repository: string, token: string | undefined): string {
  if (token) {
    return `https://oauth2:${token}@${host}/${repository}.git`;
  }
  return `https://${host}/${repository}.git`;
}

/**
 * The tokenless URL for a repo, used to scrub the token from the persisted
 * remote so it never sits in plaintext in `.git/config`.
 */
function tokenlessUrl(host: string, repository: string): string {
  return `https://${host}/${repository}.git`;
}

/**
 * Validate the user-supplied GitLab fields. Rejects values containing shell
 * metacharacters, leading dashes (git option injection), or path traversal so
 * a malicious config can't smuggle arguments into git.
 */
export function validateGitLabInput(host: string, repository: string, branch: string): void {
  if (!HOST_RE.test(host) || host.startsWith('-')) {
    throw new Error(`Invalid GitLab host: "${host}"`);
  }
  if (!REPOSITORY_RE.test(repository) || repository.startsWith('-') || repository.includes('..')) {
    throw new Error(
      `Invalid GitLab repository: "${repository}" (expected "group/project" or "group/subgroup/project")`
    );
  }
  if (!BRANCH_RE.test(branch) || branch.startsWith('-')) {
    throw new Error(`Invalid GitLab branch: "${branch}"`);
  }
}

/** Run git with array args (no shell) so values can't be interpreted as commands. */
function git(args: string[]): void {
  execFileSync('git', args, { stdio: 'pipe' });
}

/** Run git and return trimmed stdout (no shell). */
function gitOutput(args: string[]): string {
  return execFileSync('git', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    .toString()
    .trim();
}

/**
 * Remove the token-bearing remote URL from disk by resetting origin to the
 * plain HTTPS URL. The token was only ever used inline for the clone/fetch.
 *
 * Security: when a token was used, this MUST succeed — if the scrub (or its
 * verification) fails we delete the clone and throw, rather than leaving a
 * plaintext token sitting in `.git/config`. `.temp-repos` is gitignored, but a
 * leaked token on disk is not acceptable as a best-effort.
 */
export function scrubRemote(localPath: string, host: string, repository: string): void {
  const safeUrl = tokenlessUrl(host, repository);
  try {
    git(['-C', localPath, 'remote', 'set-url', 'origin', safeUrl]);
    // Verify the token is actually gone from the persisted remote.
    const persisted = gitOutput(['-C', localPath, 'remote', 'get-url', 'origin']);
    if (persisted !== safeUrl || persisted.includes('@')) {
      throw new Error(`remote still contains credentials after scrub`);
    }
  } catch (err) {
    // Hard-fail: remove the clone so no token-bearing .git/config remains.
    try {
      rmSync(localPath, { recursive: true, force: true });
    } catch {
      // ignore cleanup failure; the throw below is what matters
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to scrub GitLab token from ${repository}'s git remote (${reason}). ` +
        `Clone removed to avoid leaving the token on disk.`
    );
  }
}

/**
 * Clone a repository with branch fallback.
 */
function cloneRepository(
  cloneUrl: string,
  localPath: string,
  branch: string,
  repository: string,
  hasToken: boolean
): void {
  try {
    git(['clone', '--depth', '1', '--branch', branch, cloneUrl, localPath]);
  } catch {
    // If branch-specific clone fails, try the default branch.
    try {
      git(['clone', '--depth', '1', cloneUrl, localPath]);
    } catch {
      throw new Error(
        `Failed to clone ${repository}. ` +
          (hasToken
            ? 'Check the repository exists and the token has read access.'
            : 'Repository may be private - set GITLAB_TOKEN.')
      );
    }
  }
}

// =============================================================================
// GITLAB FETCHER
// =============================================================================

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
  if (!source.repository) {
    throw new Error(`GitLab source '${source.name}' requires 'repository' field`);
  }

  const host = source.gitlabHost || DEFAULT_GITLAB_HOST;
  validateGitLabInput(host, source.repository, source.branch);

  // GitLab projects can be nested in subgroups, so use the last path segment.
  const repoName = source.repository.split('/').pop()!;
  const localPath = path.join(TEMP_DIR, `gitlab-${repoName}`);

  mkdirSync(TEMP_DIR, { recursive: true });

  const token = process.env.GITLAB_TOKEN;
  const cloneUrl = buildCloneUrl(host, source.repository, token);

  // Reuse an existing clone when possible; otherwise (re)clone.
  if (existsSync(localPath)) {
    try {
      git(['-C', localPath, 'fetch', '--depth', '1', 'origin', source.branch]);
      git(['-C', localPath, 'reset', '--hard', `origin/${source.branch}`]);
    } catch {
      rmSync(localPath, { recursive: true });
      cloneRepository(cloneUrl, localPath, source.branch, source.repository, !!token);
    }
  } else {
    cloneRepository(cloneUrl, localPath, source.branch, source.repository, !!token);
  }

  // Don't leave the token sitting in .git/config; the clone/fetch already used it.
  if (token) {
    scrubRemote(localPath, host, source.repository);
  }

  // Resolve content path (with optional subpath).
  const contentPath =
    source.path && source.path !== '.' ? path.join(localPath, source.path) : localPath;

  if (!existsSync(contentPath)) {
    throw new Error(`Path '${source.path}' not found in repository ${source.repository}`);
  }

  return {
    name: source.name,
    displayName: source.displayName || source.name,
    localPath: contentPath,
    cleanup: () => {
      if (existsSync(localPath)) {
        rmSync(localPath, { recursive: true });
      }
    },
  };
}
