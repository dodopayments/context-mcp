/**
 * Validate Script
 *
 * Validates config.yaml (structure + embedding consistency) without running a
 * full reindex. Useful in CI and as a pre-flight check before `npm run reindex`.
 *
 * Usage:
 *   npx tsx scripts/validate.ts
 *   npx tsx scripts/validate.ts --config path/to/config.yaml
 *   npx tsx scripts/validate.ts --check-env   # also require provider API keys
 */

import 'dotenv/config';
import {
  CONFIG_PATHS,
  findConfigFile,
  validateConfigFile,
} from '../src/config/validate-config.js';
import { parseValidateArgs, printValidateHelp } from '../src/config/validate-cli.js';

function main(): void {
  const args = parseValidateArgs(process.argv.slice(2));
  if (args.help) {
    printValidateHelp();
    return;
  }

  console.log('🔍 Validating ContextMCP configuration\n');
  console.log('═'.repeat(50));

  // 1. Locate config file.
  const configPath = args.config || findConfigFile();
  if (!configPath) {
    console.error('\n❌ Configuration file not found.');
    console.error(`   Looked for: ${CONFIG_PATHS.join(', ')}`);
    process.exit(1);
  }
  console.log(`\n📄 Config file: ${configPath}`);

  // 2-4. Validate (YAML parse + structural + semantic checks).
  const result = validateConfigFile(configPath, { checkEnv: args.checkEnv });

  for (const line of result.summary) {
    console.log(`\n✓ ${line}`);
  }

  // 5. Report.
  console.log('\n' + '═'.repeat(50));
  if (result.warnings.length > 0) {
    console.log(`\n⚠️  ${result.warnings.length} warning(s):`);
    for (const w of result.warnings) console.log(`   • ${w}`);
  }

  if (!result.valid) {
    console.error(`\n❌ ${result.errors.length} error(s):`);
    for (const e of result.errors) console.error(`   • ${e}`);
    console.error('\nConfiguration is INVALID.');
    process.exit(1);
  }

  console.log('\n✅ Configuration is valid.');
}

main();
