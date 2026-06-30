/**
 * Shared Git Source Fetcher
 *
 * Common implementation behind the GitHub and GitLab source fetchers. Both
 * providers clone a repo over HTTPS, optionally authenticating with a token in
 * the URL userinfo, then scrub that token back out of `.git/config`. The only
 * real differences between them are captured by {@link GitProviderSpec}:
 *
 *  - how a token is encoded in the URL userinfo
 *    (GitHub: `x-access-token:<token>`, GitLab: `oauth2:<token>`),
 *  - which env var holds the token (`GITHUB_TOKEN` / `GITLAB_TOKEN`),
 *  - the local clone directory prefix, and
 *  - the human-readable provider name / repository-format hint used in errors.
 *
 * Security: all git invocations use `execFileSync` (no shell) with array args,
 * plus conservative allowlist validation of user-supplied fields, so a
 * malicious config can't smuggle shell metacharacters, git option injection
 * (leading `-`), or path traversal (`..`) into the command. A token is only
 * ever used inline for the clone/fetch and is then scrubbed from `.git/config`;
 * if the scrub can't be verified the clone is deleted and an error is thrown,
 * so a token can never linger in plaintext on disk.
 */

import { execFileSync } from 'child_process';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';
import { SourceConfig } from '../config/schema.js';
import { withRetry, isRetryableGitError } from '../embeddings/core.js';

// =============================================================================
// TYPES
// =============================================================================

export interface FetchedSource {
  name: string;
  displayName: string;
  localPath: string;
  cleanup: () => void;
}

/**
 * Per-provider differences between otherwise-identical git fetchers.
 */
export interface GitProviderSpec {
  /** Human-readable provider name used in error messages, e.g. "GitHub". */
  name: string;
  /** Env var holding the auth token, e.g. "GITHUB_TOKEN". */
  tokenEnvVar: string;
  /**
   * Encode a token into the URL userinfo segment (before the `@`), e.g.
   * GitHub: `x-access-token:<token>`, GitLab: `oauth2:<token>`.
   */
  tokenUserinfo: (token: string) => string;
  /** Prefix for the local clone directory inside TEMP_DIR (e.g. "" or "gitlab-"). */
  localDirPrefix: string;
  /** Repository-format hint shown in validation errors, e.g. `"owner/repo"`. */
  repositoryHint: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TEMP_DIR = path.join(process.cwd(), '.temp-repos');

// Conservative allowlists. Defense-in-depth on top of using execFileSync (no
// shell), so even non-shell git argument confusion is prevented.
const HOST_RE = /^[a-zA-Z0-9.-]+(:\d+)?$/;
const REPOSITORY_RE = /^[a-zA-Z0-9._-]+(\/[a-zA-Z0-9._-]+)+$/;
const BRANCH_RE = /^[a-zA-Z0-9._/-]+$/;

// =============================================================================
// LOW-LEVEL GIT (no shell)
// =============================================================================

/** Run git with array args (no shell) so values can't be interpreted as commands. */
export function git(args: string[]): void {
  execFileSync('git', args, { stdio: 'pipe' });
}

/** Run git and return trimmed stdout (no shell). */
export function gitOutput(args: string[]): string {
  return execFileSync('git', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    .toString()
    .trim();
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate the user-supplied host/repository/branch for a git source. Rejects
 * values containing shell metacharacters, leading dashes (git option
 * injection), or path traversal so a malicious config can't smuggle arguments
 * into git. Errors are phrased with the provider's name.
 */
export function validateGitInput(
  spec: GitProviderSpec,
  host: string,
  repository: string,
  branch: string
): void {
  if (!HOST_RE.test(host) || host.startsWith('-')) {
    throw new Error(`Invalid ${spec.name} host: "${host}"`);
  }
  if (!REPOSITORY_RE.test(repository) || repository.startsWith('-') || repository.includes('..')) {
    throw new Error(
      `Invalid ${spec.name} repository: "${repository}" (expected ${spec.repositoryHint})`
    );
  }
  if (!BRANCH_RE.test(branch) || branch.startsWith('-')) {
    throw new Error(`Invalid ${spec.name} branch: "${branch}"`);
  }
}

// =============================================================================
// URL CONSTRUCTION
// =============================================================================

/** The tokenless HTTPS URL for a repo on a host. */
export function tokenlessUrl(host: string, repository: string): string {
  return `https://${host}/${repository}.git`;
}

/**
 * Build a clone URL, embedding a token in the userinfo for private repos using
 * the provider's userinfo encoding.
 */
export function buildGitCloneUrl(
  spec: GitProviderSpec,
  host: string,
  repository: string,
  token: string | undefined
): string {
  if (token) {
    return `https://${spec.tokenUserinfo(token)}@${host}/${repository}.git`;
  }
  return tokenlessUrl(host, repository);
}

// =============================================================================
// LOCAL CLONE DIRECTORY
// =============================================================================

/**
 * Resolve the local clone directory for a repository.
 *
 * The directory is derived from the **full** repository path, not just the
 * last segment, so two sources whose paths share a final segment — e.g.
 * `team-a/docs` vs `team-b/docs`, or GitLab subgroups `group/sub1/docs` vs
 * `group/sub2/docs` — resolve to distinct directories. Deriving from the last
 * segment alone caused a silent collision: the second source would reuse the
 * first's clone (via the fetch + `reset --hard` reuse path) and index the
 * wrong repository's content with no error.
 *
 * The dir name is `<prefix><sanitized-slug>-<hash>`:
 *  - the slug keeps the dir human-readable (non-`[a-zA-Z0-9._-]` chars, notably
 *    the `/` separators, replaced with `-`), and
 *  - the hash is a short digest of the *raw* `host` + repository path, which
 *    guarantees distinct repositories map to distinct dirs even when their slugs
 *    collide.
 *
 * The hash matters because sanitizing alone is not injective: `/` and `-` both
 * become `-`, so without it `team-a/docs` and `team/a-docs` (two different
 * repos) would still share a directory and reintroduce the silent-collision bug.
 *
 * The **host** is hashed alongside the repository because the same repo path can
 * live on different hosts — most importantly two different self-hosted GitLab
 * instances (`gitlab.company-a.com` vs `gitlab.company-b.com`) both serving
 * `docs/api`. Without the host in the key those two sources would share a clone
 * dir, and the second would silently reuse the first instance's checkout (via
 * the fetch + `reset --hard` reuse path, whose `origin` still points at the
 * first host) — the same silent-collision class as the slug/last-segment bugs.
 * `host` and `repository` are joined with a newline, which can appear in
 * neither (`HOST_RE` / `REPOSITORY_RE` allowlists), so the hashed input stays
 * injective and no host/repository boundary ambiguity can manufacture a collision.
 */
export function localCloneDir(spec: GitProviderSpec, host: string, repository: string): string {
  const slug = repository.replace(/[^a-zA-Z0-9._-]/g, '-');
  const hash = createHash('sha256').update(`${host}\n${repository}`).digest('hex').slice(0, 8);
  return path.join(TEMP_DIR, `${spec.localDirPrefix}${slug}-${hash}`);
}

// =============================================================================
// TOKEN SCRUBBING
// =============================================================================

/**
 * Remove the token-bearing remote URL from disk by resetting origin to the
 * plain HTTPS URL. The token was only ever used inline for the clone/fetch.
 *
 * Security: when a token was used, this MUST succeed — if the scrub (or its
 * verification) fails we delete the clone and throw, rather than leaving a
 * plaintext token sitting in `.git/config`. `.temp-repos` is gitignored, but a
 * leaked token on disk is not acceptable as a best-effort.
 */
export function scrubGitRemote(
  spec: GitProviderSpec,
  localPath: string,
  host: string,
  repository: string
): void {
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
      `Failed to scrub ${spec.name} token from ${repository}'s git remote (${reason}). ` +
        `Clone removed to avoid leaving the token on disk.`
    );
  }
}

// =============================================================================
// CLONE
// =============================================================================

/**
 * Clone a repository with branch fallback. Only the network-bound clone is
 * retried (via withRetry + isRetryableGitError); the branch→default-branch
 * fallback is preserved because a non-retryable "Remote branch X not found"
 * throws on the first attempt and falls through to the default-branch clone.
 *
 * A failed clone can leave a partial checkout on disk; each attempt clears it
 * first so a retry never fails with a permanent-looking "destination path
 * already exists" — that would mask the transient failure we are retrying.
 */
async function cloneRepository(
  spec: GitProviderSpec,
  cloneUrl: string,
  localPath: string,
  branch: string,
  repository: string,
  hasToken: boolean
): Promise<void> {
  const label = `${spec.name} clone ${repository}`;
  try {
    await withRetry(
      async () => {
        if (existsSync(localPath)) rmSync(localPath, { recursive: true, force: true });
        git(['clone', '--depth', '1', '--branch', branch, cloneUrl, localPath]);
      },
      { shouldRetry: isRetryableGitError, label }
    );
  } catch {
    // If branch-specific clone fails (non-retryable, e.g. branch not found, OR
    // transient but exhausted retries) — try the default branch.
    try {
      await withRetry(
        async () => {
          if (existsSync(localPath)) rmSync(localPath, { recursive: true, force: true });
          git(['clone', '--depth', '1', cloneUrl, localPath]);
        },
        { shouldRetry: isRetryableGitError, label }
      );
    } catch {
      throw new Error(
        `Failed to clone ${repository}. ` +
          (hasToken
            ? 'Check the repository exists and the token has read access.'
            : `Repository may be private - set ${spec.tokenEnvVar}.`)
      );
    }
  }
}

// =============================================================================
// FETCHER
// =============================================================================

/**
 * Clone a git repository (GitHub or GitLab) for parsing.
 *
 * Config fields used:
 * - repository: "owner/repo" / "group/project" / "group/subgroup/project" (required)
 * - branch: defaults to "main" (via schema)
 * - path: optional subdirectory within the repo
 *
 * @param spec   provider-specific behavior (token encoding, env var, etc.)
 * @param source the source config entry
 * @param host   the host to clone from (e.g. "github.com" or a self-hosted GitLab)
 */
export async function fetchGitSource(
  spec: GitProviderSpec,
  source: SourceConfig,
  host: string
): Promise<FetchedSource> {
  if (!source.repository) {
    throw new Error(`${spec.name} source '${source.name}' requires 'repository' field`);
  }

  const branch = source.branch || 'main';
  validateGitInput(spec, host, source.repository, branch);

  // Derive the clone dir from the full repo path so repos sharing a last
  // segment (e.g. team-a/docs vs team-b/docs, or GitLab subgroups) don't
  // collide and silently serve each other's content.
  const localPath = localCloneDir(spec, host, source.repository);

  mkdirSync(TEMP_DIR, { recursive: true });

  const token = process.env[spec.tokenEnvVar];
  const cloneUrl = buildGitCloneUrl(spec, host, source.repository, token);

  // Reuse an existing clone when possible; otherwise (re)clone.
  if (existsSync(localPath)) {
    try {
      // Only the network fetch is retried. The subsequent `reset --hard` is a
      // local, deterministic op — retrying it would mask real corruption.
      await withRetry(
        async () => git(['-C', localPath, 'fetch', '--depth', '1', 'origin', branch]),
        { shouldRetry: isRetryableGitError, label: `${spec.name} fetch ${source.repository}` }
      );
      git(['-C', localPath, 'reset', '--hard', `origin/${branch}`]);
    } catch {
      rmSync(localPath, { recursive: true, force: true });
      await cloneRepository(spec, cloneUrl, localPath, branch, source.repository, !!token);
    }
  } else {
    await cloneRepository(spec, cloneUrl, localPath, branch, source.repository, !!token);
  }

  // Don't leave the token sitting in .git/config; the clone/fetch already used it.
  if (token) {
    scrubGitRemote(spec, localPath, host, source.repository);
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
