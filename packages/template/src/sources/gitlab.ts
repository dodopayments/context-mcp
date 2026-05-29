/**
 * GitLab Source Fetcher
 *
 * Clones repositories from GitLab (gitlab.com or a self-hosted instance) for
 * documentation parsing. Supports private repositories via GITLAB_TOKEN.
 */

import { execSync } from 'child_process';
import { existsSync, rmSync, mkdirSync } from 'fs';
import * as path from 'path';
import { SourceConfig } from '../config/schema.js';
import type { FetchedSource } from './github.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const TEMP_DIR = path.join(process.cwd(), '.temp-repos');
const DEFAULT_GITLAB_HOST = 'gitlab.com';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build a clone URL for GitLab, embedding a token for private repos.
 * GitLab uses the `oauth2:<token>` userinfo form for HTTPS token auth.
 */
export function buildCloneUrl(
  host: string,
  repository: string,
  token: string | undefined
): string {
  if (token) {
    return `https://oauth2:${token}@${host}/${repository}.git`;
  }
  return `https://${host}/${repository}.git`;
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
    execSync(`git clone --depth 1 --branch ${branch} ${cloneUrl} "${localPath}"`, {
      stdio: 'pipe',
    });
  } catch {
    // If branch-specific clone fails, try the default branch.
    try {
      execSync(`git clone --depth 1 ${cloneUrl} "${localPath}"`, { stdio: 'pipe' });
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
  // GitLab projects can be nested in subgroups, so use the last path segment.
  const repoName = source.repository.split('/').pop()!;
  const localPath = path.join(TEMP_DIR, `gitlab-${repoName}`);

  mkdirSync(TEMP_DIR, { recursive: true });

  const token = process.env.GITLAB_TOKEN;
  const cloneUrl = buildCloneUrl(host, source.repository, token);

  // Reuse an existing clone when possible; otherwise (re)clone.
  if (existsSync(localPath)) {
    try {
      execSync(`git -C "${localPath}" fetch --depth 1 origin ${source.branch}`, { stdio: 'pipe' });
      execSync(`git -C "${localPath}" reset --hard origin/${source.branch}`, { stdio: 'pipe' });
    } catch {
      rmSync(localPath, { recursive: true });
      cloneRepository(cloneUrl, localPath, source.branch, source.repository, !!token);
    }
  } else {
    cloneRepository(cloneUrl, localPath, source.branch, source.repository, !!token);
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
