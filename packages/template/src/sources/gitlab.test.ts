import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildCloneUrl, validateGitLabInput, scrubRemote } from './gitlab.js';

describe('buildCloneUrl', () => {
  it('builds a plain HTTPS URL when no token is provided', () => {
    expect(buildCloneUrl('gitlab.com', 'group/project', undefined)).toBe(
      'https://gitlab.com/group/project.git'
    );
  });

  it('embeds the token using the oauth2 userinfo form for private repos', () => {
    expect(buildCloneUrl('gitlab.com', 'group/project', 'secret-token')).toBe(
      'https://oauth2:secret-token@gitlab.com/group/project.git'
    );
  });

  it('supports a self-hosted host', () => {
    expect(buildCloneUrl('gitlab.example.com', 'g/p', undefined)).toBe(
      'https://gitlab.example.com/g/p.git'
    );
  });

  it('supports nested subgroups in the repository path', () => {
    expect(buildCloneUrl('gitlab.com', 'group/subgroup/project', undefined)).toBe(
      'https://gitlab.com/group/subgroup/project.git'
    );
  });
});

describe('validateGitLabInput', () => {
  it('accepts a normal host/repo/branch', () => {
    expect(() => validateGitLabInput('gitlab.com', 'group/project', 'main')).not.toThrow();
  });

  it('accepts a self-hosted host with a port and nested subgroups', () => {
    expect(() =>
      validateGitLabInput('gitlab.example.com:8443', 'group/subgroup/project', 'release/1.0')
    ).not.toThrow();
  });

  it('rejects shell metacharacters in the branch (command injection)', () => {
    expect(() => validateGitLabInput('gitlab.com', 'g/p', 'main; rm -rf ~')).toThrow(
      /Invalid GitLab branch/
    );
    expect(() => validateGitLabInput('gitlab.com', 'g/p', 'main$(whoami)')).toThrow();
    expect(() => validateGitLabInput('gitlab.com', 'g/p', 'main`id`')).toThrow();
  });

  it('rejects a leading dash (git option injection)', () => {
    expect(() => validateGitLabInput('gitlab.com', 'g/p', '--upload-pack=evil')).toThrow(
      /Invalid GitLab branch/
    );
    expect(() => validateGitLabInput('-oProxyCommand=evil', 'g/p', 'main')).toThrow(
      /Invalid GitLab host/
    );
  });

  it('rejects path traversal in the repository', () => {
    expect(() => validateGitLabInput('gitlab.com', '../../etc/passwd', 'main')).toThrow(
      /Invalid GitLab repository/
    );
  });

  it('rejects a single-segment repository (must be group/project)', () => {
    expect(() => validateGitLabInput('gitlab.com', 'justaname', 'main')).toThrow(
      /Invalid GitLab repository/
    );
  });

  it('rejects metacharacters in the host', () => {
    expect(() => validateGitLabInput('gitlab.com;curl evil', 'g/p', 'main')).toThrow(
      /Invalid GitLab host/
    );
  });
});

describe('scrubRemote', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function makeRepo(originUrl: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitlab-scrub-'));
    tmpDirs.push(dir);
    execFileSync('git', ['-C', dir, 'init', '-q'], { stdio: 'pipe' });
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', originUrl], { stdio: 'pipe' });
    return dir;
  }

  function originUrl(dir: string): string {
    return execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { stdio: 'pipe' })
      .toString()
      .trim();
  }

  it('rewrites a token-bearing origin to the tokenless URL', () => {
    const dir = makeRepo('https://oauth2:secret-token@gitlab.com/group/project.git');
    scrubRemote(dir, 'gitlab.com', 'group/project');

    const url = originUrl(dir);
    expect(url).toBe('https://gitlab.com/group/project.git');
    expect(url).not.toContain('secret-token');
    expect(url).not.toContain('@');
  });

  it('is idempotent on an already-clean remote', () => {
    const dir = makeRepo('https://gitlab.com/group/project.git');
    scrubRemote(dir, 'gitlab.com', 'group/project');
    expect(originUrl(dir)).toBe('https://gitlab.com/group/project.git');
  });

  it('hard-fails and removes the clone when scrubbing is impossible', () => {
    // No .git here, so `git remote set-url` cannot succeed.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitlab-noscrub-'));
    tmpDirs.push(dir);
    expect(() => scrubRemote(dir, 'gitlab.com', 'group/project')).toThrow(/Failed to scrub/);
    // The clone directory is removed so no token-bearing config can linger.
    expect(fs.existsSync(dir)).toBe(false);
  });
});
