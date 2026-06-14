/**
 * CLI argument parsing for the `validate` script — extracted so it can be
 * unit-tested independently of process.argv.
 */

export interface ValidateArgs {
  config?: string;
  checkEnv: boolean;
  help: boolean;
  /** Set when argv is malformed (e.g. --config with no value). */
  error?: string;
}

/** Parse argv (without the leading `node script` entries) into ValidateArgs. */
export function parseValidateArgs(argv: string[]): ValidateArgs {
  const args: ValidateArgs = { checkEnv: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--check-env') {
      args.checkEnv = true;
    } else if (arg === '--config' || arg === '-c') {
      const value = argv[i + 1];
      // Guard against `--config` being the final arg (or immediately followed
      // by another flag), which would otherwise silently fall back to config
      // discovery as if no path were requested.
      if (value === undefined || value.startsWith('-')) {
        args.error = `${arg} requires a file path`;
        return args;
      }
      args.config = value;
      i++;
    }
  }
  return args;
}

export function printValidateHelp(): void {
  console.log(`
ContextMCP Validate Script

Validates config.yaml without running a reindex.

Usage:
  npx tsx scripts/validate.ts [options]

Options:
  --help, -h             Show this help message
  --config, -c <path>    Validate a specific config file
  --check-env            Also verify required API key env vars are set

Exit codes:
  0  configuration is valid
  1  configuration is invalid (or file not found)
`);
}
