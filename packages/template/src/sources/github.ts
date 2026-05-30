/**
 * GitHub Source Fetcher
 *
 * Clones repositories from GitHub for documentation parsing.
 * Supports both public and private repositories (via GITHUB_TOKEN).
 *
 * Security: all git invocations use `execFileSync` (no shell) with array args,
 * plus conservative allowlist validation of user-supplied fields, so a
 * malicious config can't smuggle shell metacharacters or git option injection
 * (leading `-`) or path traversal (`..`) into the command. The token is only
 * ever used inline for the clone/fetch and is then scrubbed from `.git/config`.
 */

import { execFileSync } from 'child_process';
import { existsSync, rmSync, mkdirSync } from 'fs';
import * as path from 'path';
import { SourceConfig } from '../config/schema.js';

// =============================================================================
// TYPES
// =============================================================================

export interface FetchedSource {
  name: string;
  displayName: string;
  localPath: string;
  cleanup: () => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TEMP_DIR = path.join(process.cwd(), '.temp-repos');
const GITHUB_HOST = 'github.com';

// Conservative allowlists. Defense-in-depth on top of using execFileSync (no
// shell), so even non-shell git argument confusion is prevented.
const REPOSITORY_RE = /^[a-zA-Z0-9._-]+(\/[a-zA-Z0-9._-]+)+$/;
const BRANCH_RE = /^[a-zA-Z0-9._/-]+$/;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Validate the user-supplied GitHub fields. Rejects values containing shell
 * metacharacters, leading dashes (git option injection), or path traversal so
 * a malicious config can't smuggle arguments into git.
 */
export function validateGitHubInput(repository: string, branch: string): void {
  if (!REPOSITORY_RE.test(repository) || repository.startsWith('-') || repository.includes('..')) {
    throw new Error(`Invalid GitHub repository: "${repository}" (expected "owner/repo")`);
  }
  if (!BRANCH_RE.test(branch) || branch.startsWith('-')) {
    throw new Error(`Invalid GitHub branch: "${branch}"`);
  }
}

/**
 * Build a clone URL for GitHub, embedding a token for private repos.
 * GitHub accepts the `x-access-token:<token>` userinfo form for HTTPS auth.
 */
export function buildCloneUrl(repository: string, token: string | undefined): string {
  if (token) {
    return `https://x-access-token:${token}@${GITHUB_HOST}/${repository}.git`;
  }
  return `https://${GITHUB_HOST}/${repository}.git`;
}

/** The tokenless URL for a repo, used to scrub the token from the remote. */
function tokenlessUrl(repository: string): string {
  return `https://${GITHUB_HOST}/${repository}.git`;
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
export function scrubRemote(localPath: string, repository: string): void {
  const safeUrl = tokenlessUrl(repository);
  try {
    git(['-C', localPath, 'remote', 'set-url', 'origin', safeUrl]);
    const persisted = gitOutput(['-C', localPath, 'remote', 'get-url', 'origin']);
    if (persisted !== safeUrl || persisted.includes('@')) {
      throw new Error(`remote still contains credentials after scrub`);
    }
  } catch (err) {
    try {
      rmSync(localPath, { recursive: true, force: true });
    } catch {
      // ignore cleanup failure; the throw below is what matters
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to scrub GitHub token from ${repository}'s git remote (${reason}). ` +
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
            : 'Repository may be private - set GITHUB_TOKEN.')
      );
    }
  }
}

// =============================================================================
// GITHUB FETCHER
// =============================================================================

/**
 * Clone a GitHub repository for parsing.
 *
 * Config fields used:
 * - repository: "owner/repo" (required)
 * - branch: defaults to "main"
 * - path: optional subdirectory within the repo
 */
export async function fetchGitHubSource(source: SourceConfig): Promise<FetchedSource> {
  if (!source.repository) {
    throw new Error(`GitHub source '${source.name}' requires 'repository' field`);
  }

  const branch = source.branch || 'main';
  validateGitHubInput(source.repository, branch);

  const repoName = source.repository.split('/').pop()!;
  const localPath = path.join(TEMP_DIR, repoName);

  mkdirSync(TEMP_DIR, { recursive: true });

  const token = process.env.GITHUB_TOKEN;
  const cloneUrl = buildCloneUrl(source.repository, token);

  // Reuse an existing clone when possible; otherwise (re)clone.
  if (existsSync(localPath)) {
    try {
      git(['-C', localPath, 'fetch', '--depth', '1', 'origin', branch]);
      git(['-C', localPath, 'reset', '--hard', `origin/${branch}`]);
    } catch {
      rmSync(localPath, { recursive: true });
      cloneRepository(cloneUrl, localPath, branch, source.repository, !!token);
    }
  } else {
    cloneRepository(cloneUrl, localPath, branch, source.repository, !!token);
  }

  // Don't leave the token sitting in .git/config; the clone/fetch already used it.
  if (token) {
    scrubRemote(localPath, source.repository);
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
