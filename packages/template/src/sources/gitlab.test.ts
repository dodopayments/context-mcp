import { describe, it, expect } from 'vitest';
import { buildCloneUrl } from './gitlab.js';

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
