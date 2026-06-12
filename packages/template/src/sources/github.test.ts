import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildCloneUrl, validateGitHubInput, scrubRemote } from './github.js';

describe('buildCloneUrl', () => {
  it('builds a tokenless URL for public repos', () => {
    expect(buildCloneUrl('owner/repo', undefined)).toBe('https://github.com/owner/repo.git');
  });

  it('embeds the token using the x-access-token userinfo form', () => {
    expect(buildCloneUrl('owner/repo', 'ghp_secret')).toBe(
      'https://x-access-token:ghp_secret@github.com/owner/repo.git'
    );
  });
});

describe('validateGitHubInput', () => {
  it('accepts a normal owner/repo + branch', () => {
    expect(() => validateGitHubInput('owner/repo', 'main')).not.toThrow();
  });

  it('rejects shell metacharacters in the repository', () => {
    expect(() => validateGitHubInput('owner/repo;rm -rf /', 'main')).toThrow(
      /Invalid GitHub repository/
    );
  });

  it('rejects a leading dash (git option injection)', () => {
    expect(() => validateGitHubInput('--upload-pack=x/y', 'main')).toThrow(
      /Invalid GitHub repository/
    );
    expect(() => validateGitHubInput('owner/repo', '--foo')).toThrow(/Invalid GitHub branch/);
  });

  it('rejects path traversal in the repository', () => {
    expect(() => validateGitHubInput('../../etc/passwd', 'main')).toThrow(
      /Invalid GitHub repository/
    );
  });

  it('rejects a single-segment repository (must be owner/repo)', () => {
    expect(() => validateGitHubInput('justaname', 'main')).toThrow(/Invalid GitHub repository/);
  });
});

describe('scrubRemote', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function makeRepo(originUrl: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-scrub-'));
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
    const dir = makeRepo('https://x-access-token:ghp_secret@github.com/owner/repo.git');
    scrubRemote(dir, 'owner/repo');

    const url = originUrl(dir);
    expect(url).toBe('https://github.com/owner/repo.git');
    expect(url).not.toContain('ghp_secret');
    expect(url).not.toContain('@');
  });

  it('is idempotent on an already-clean remote', () => {
    const dir = makeRepo('https://github.com/owner/repo.git');
    scrubRemote(dir, 'owner/repo');
    expect(originUrl(dir)).toBe('https://github.com/owner/repo.git');
  });

  it('hard-fails and removes the clone when scrubbing is impossible', () => {
    // No .git here, so `git remote set-url` cannot succeed.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-noscrub-'));
    tmpDirs.push(dir);
    expect(() => scrubRemote(dir, 'owner/repo')).toThrow(/Failed to scrub/);
    expect(fs.existsSync(dir)).toBe(false);
  });
});
