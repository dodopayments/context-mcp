/**
 * GitHub Source Fetcher
 *
 * Clones repositories from GitHub for documentation parsing.
 * Supports both public and private repositories (via GITHUB_TOKEN).
 */

import { execSync } from 'child_process';
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

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Clone a repository with branch fallback
 */
async function cloneRepository(
  cloneUrl: string,
  localPath: string,
  branch: string,
  repository: string,
  hasToken: boolean
): Promise<void> {
  try {
    execSync(`git clone --depth 1 --branch ${branch} ${cloneUrl} "${localPath}"`, {
      stdio: 'pipe',
    });
    } catch {
      // If branch-specific clone fails, try default branch
      try {
        execSync(`git clone --depth 1 ${cloneUrl} "${localPath}"`, { stdio: 'pipe' });
      } catch {
      throw new Error(
        `Failed to clone ${repository}. ` +
          (hasToken
            ? 'Check repository exists and token has access.'
            : 'Repository may be private - set GITHUB_TOKEN.')
      );
    }
  }
}

// =============================================================================
// GITHUB FETCHER
// =============================================================================

/**
 * Clone a GitHub repository for parsing
 */
export async function fetchGitHubSource(source: SourceConfig): Promise<FetchedSource> {
  if (!source.repository) {
    throw new Error(`GitHub source '${source.name}' requires 'repository' field`);
  }

  const repoName = source.repository.split('/').pop()!;
  const localPath = path.join(TEMP_DIR, repoName);

  // Ensure temp directory exists
  mkdirSync(TEMP_DIR, { recursive: true });

  // Support for private repos via GITHUB_TOKEN
  const token = process.env.GITHUB_TOKEN;
  const cloneUrl = token
    ? `https://${token}@github.com/${source.repository}.git`
    : `https://github.com/${source.repository}.git`;

  // Check if repo already exists - pull updates instead of re-cloning
  if (existsSync(localPath)) {
    try {
      execSync(`git -C "${localPath}" fetch --depth 1 origin ${source.branch}`, { stdio: 'pipe' });
      execSync(`git -C "${localPath}" reset --hard origin/${source.branch}`, { stdio: 'pipe' });
    } catch {
      // If pull fails (e.g., branch changed), delete and re-clone
      rmSync(localPath, { recursive: true });
      await cloneRepository(cloneUrl, localPath, source.branch, source.repository, !!token);
    }
  } else {
    await cloneRepository(cloneUrl, localPath, source.branch, source.repository, !!token);
  }

  // Resolve content path (with optional subpath)
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
