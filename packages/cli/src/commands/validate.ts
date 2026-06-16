/**
 * `contextmcp validate` — validate a project's config.yaml (structure +
 * embedding consistency) without running a reindex. A fast pre-flight check,
 * ideal for CI gating. The validation logic lives in `../config/validate-config.ts`.
 */

import { config as loadEnv } from 'dotenv';
import chalk from 'chalk';
import { CONFIG_PATHS, findConfigFile, validateConfigFile } from '../config/validate-config.js';

export interface ValidateOptions {
  config?: string;
  checkEnv?: boolean;
}

export function validateCommand(options: ValidateOptions): void {
  // Load the project's .env (quietly) so --check-env can see provider API keys.
  loadEnv({ quiet: true });

  console.log(chalk.bold('\n🔍 Validating ContextMCP configuration\n'));
  console.log(chalk.dim('═'.repeat(50)));

  const configPath = options.config || findConfigFile();
  if (!configPath) {
    console.error(chalk.red('\n❌ Configuration file not found.'));
    console.error(chalk.dim(`   Looked for: ${CONFIG_PATHS.join(', ')}`));
    process.exit(1);
  }
  console.log(`\n📄 Config file: ${chalk.cyan(configPath)}`);

  const result = validateConfigFile(configPath, { checkEnv: options.checkEnv });

  for (const line of result.summary) {
    console.log(chalk.green(`\n✓ ${line}`));
  }

  console.log('\n' + chalk.dim('═'.repeat(50)));

  if (result.warnings.length > 0) {
    console.log(chalk.yellow(`\n⚠️  ${result.warnings.length} warning(s):`));
    for (const w of result.warnings) console.log(chalk.yellow(`   • ${w}`));
  }

  if (!result.valid) {
    console.error(chalk.red(`\n❌ ${result.errors.length} error(s):`));
    for (const e of result.errors) console.error(chalk.red(`   • ${e}`));
    console.error(chalk.red('\nConfiguration is INVALID.'));
    process.exit(1);
  }

  console.log(chalk.green('\n✅ Configuration is valid.\n'));
}
