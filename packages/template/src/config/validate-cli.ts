/**
 * CLI argument parsing for the `validate` script — extracted so it can be
 * unit-tested independently of process.argv.
 */

export interface ValidateArgs {
  config?: string;
  checkEnv: boolean;
  help: boolean;
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
      args.config = argv[++i];
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
