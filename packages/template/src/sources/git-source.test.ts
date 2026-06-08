import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { localCloneDir, type GitProviderSpec } from './git-source.js';

const GITHUB_SPEC: GitProviderSpec = {
  name: 'GitHub',
  tokenEnvVar: 'GITHUB_TOKEN',
  tokenUserinfo: token => `x-access-token:${token}`,
  localDirPrefix: '',
  repositoryHint: '"owner/repo"',
};

const GITLAB_SPEC: GitProviderSpec = {
  name: 'GitLab',
  tokenEnvVar: 'GITLAB_TOKEN',
  tokenUserinfo: token => `oauth2:${token}`,
  localDirPrefix: 'gitlab-',
  repositoryHint: '"group/project" or "group/subgroup/project"',
};

const TEMP_DIR = path.join(process.cwd(), '.temp-repos');

describe('localCloneDir', () => {
  it('places the clone directly under .temp-repos as a single path segment', () => {
    const dir = localCloneDir(GITLAB_SPEC, 'group/sub/project');
    expect(path.dirname(dir)).toBe(TEMP_DIR);
    // No stray separators: the whole repo path collapses into one dir name.
    expect(path.basename(dir)).toBe(dir.slice(TEMP_DIR.length + 1));
  });

  it('keeps a human-readable, provider-prefixed slug in the dir name', () => {
    expect(path.basename(localCloneDir(GITHUB_SPEC, 'owner/repo'))).toMatch(
      /^owner-repo-[0-9a-f]+$/
    );
    expect(path.basename(localCloneDir(GITLAB_SPEC, 'group/project'))).toMatch(
      /^gitlab-group-project-[0-9a-f]+$/
    );
  });

  it('is deterministic for the same repository', () => {
    expect(localCloneDir(GITLAB_SPEC, 'group/sub/project')).toBe(
      localCloneDir(GITLAB_SPEC, 'group/sub/project')
    );
  });

  it('derives distinct dirs for repos that share a last segment (collision fix)', () => {
    // Regression test for the silent-collision bug: deriving the clone dir from
    // only the last path segment made these map to the same directory, so the
    // second source reused the first's checkout and indexed the wrong content.
    expect(localCloneDir(GITLAB_SPEC, 'team-a/docs')).not.toBe(
      localCloneDir(GITLAB_SPEC, 'team-b/docs')
    );
  });

  it('derives distinct dirs for GitLab subgroups sharing a project name', () => {
    expect(localCloneDir(GITLAB_SPEC, 'group/sub1/docs')).not.toBe(
      localCloneDir(GITLAB_SPEC, 'group/sub2/docs')
    );
  });

  it('derives distinct dirs when slugs collide via separator ambiguity', () => {
    // `/` and `-` both sanitize to `-`, so these two *different* repos produce
    // the same readable slug. The hash suffix must still keep them distinct,
    // otherwise the silent-collision bug returns through the back door.
    expect(localCloneDir(GITLAB_SPEC, 'team-a/docs')).not.toBe(
      localCloneDir(GITLAB_SPEC, 'team/a-docs')
    );
    expect(localCloneDir(GITLAB_SPEC, 'a-b/c')).not.toBe(localCloneDir(GITLAB_SPEC, 'a/b-c'));
  });

  it('also fixes the collision for GitHub sources', () => {
    expect(localCloneDir(GITHUB_SPEC, 'team-a/docs')).not.toBe(
      localCloneDir(GITHUB_SPEC, 'team-b/docs')
    );
  });

  it('keeps GitHub and GitLab clones separate even for identical repo paths', () => {
    expect(localCloneDir(GITHUB_SPEC, 'group/project')).not.toBe(
      localCloneDir(GITLAB_SPEC, 'group/project')
    );
  });
});
