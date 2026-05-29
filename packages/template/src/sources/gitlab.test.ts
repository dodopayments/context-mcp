import { describe, it, expect } from 'vitest';
import { buildCloneUrl, validateGitLabInput } from './gitlab.js';

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
