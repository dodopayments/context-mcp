import { describe, it, expect } from 'vitest';
import { parseValidateArgs } from './validate-cli.js';

describe('parseValidateArgs', () => {
  it('defaults to no flags', () => {
    expect(parseValidateArgs([])).toEqual({ checkEnv: false, help: false });
  });

  it('parses --help and -h', () => {
    expect(parseValidateArgs(['--help']).help).toBe(true);
    expect(parseValidateArgs(['-h']).help).toBe(true);
  });

  it('parses --check-env', () => {
    expect(parseValidateArgs(['--check-env']).checkEnv).toBe(true);
  });

  it('parses --config <path> and -c <path>', () => {
    expect(parseValidateArgs(['--config', 'a.yaml']).config).toBe('a.yaml');
    expect(parseValidateArgs(['-c', 'b.yml']).config).toBe('b.yml');
  });

  it('parses combined flags', () => {
    const args = parseValidateArgs(['--check-env', '--config', 'x.yaml']);
    expect(args).toEqual({ checkEnv: true, help: false, config: 'x.yaml' });
  });

  it('errors when --config has no value instead of silently ignoring it', () => {
    const args = parseValidateArgs(['--config']);
    expect(args.config).toBeUndefined();
    expect(args.error).toMatch(/--config requires a file path/);
  });

  it('errors when --config is followed by another flag', () => {
    const args = parseValidateArgs(['--config', '--check-env']);
    expect(args.error).toMatch(/requires a file path/);
    expect(args.config).toBeUndefined();
  });
});
