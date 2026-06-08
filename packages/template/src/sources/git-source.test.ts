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
  it('places the clone under .temp-repos with the provider prefix', () => {
    expect(localCloneDir(GITHUB_SPEC, 'owner/repo')).toBe(path.join(TEMP_DIR, 'owner-repo'));
    expect(localCloneDir(GITLAB_SPEC, 'group/project')).toBe(
      path.join(TEMP_DIR, 'gitlab-group-project')
    );
  });

  it('derives distinct dirs for repos that share a last segment (collision fix)', () => {
    // Regression test for the silent-collision bug: deriving the clone dir from
    // only the last path segment made these map to the same directory, so the
    // second source reused the first's checkout and indexed the wrong content.
    const a = localCloneDir(GITLAB_SPEC, 'team-a/docs');
    const b = localCloneDir(GITLAB_SPEC, 'team-b/docs');
    expect(a).not.toBe(b);
  });

  it('derives distinct dirs for GitLab subgroups sharing a project name', () => {
    const sub1 = localCloneDir(GITLAB_SPEC, 'group/sub1/docs');
    const sub2 = localCloneDir(GITLAB_SPEC, 'group/sub2/docs');
    expect(sub1).not.toBe(sub2);
    expect(sub1).toBe(path.join(TEMP_DIR, 'gitlab-group-sub1-docs'));
    expect(sub2).toBe(path.join(TEMP_DIR, 'gitlab-group-sub2-docs'));
  });

  it('also fixes the collision for GitHub sources', () => {
    const a = localCloneDir(GITHUB_SPEC, 'team-a/docs');
    const b = localCloneDir(GITHUB_SPEC, 'team-b/docs');
    expect(a).not.toBe(b);
  });

  it('keeps GitHub and GitLab clones separate even for identical repo paths', () => {
    expect(localCloneDir(GITHUB_SPEC, 'group/project')).not.toBe(
      localCloneDir(GITLAB_SPEC, 'group/project')
    );
  });

  it('produces a single safe path segment (no stray separators) under TEMP_DIR', () => {
    const dir = localCloneDir(GITLAB_SPEC, 'group/sub/project');
    expect(path.dirname(dir)).toBe(TEMP_DIR);
    expect(path.basename(dir)).toBe('gitlab-group-sub-project');
  });
});
