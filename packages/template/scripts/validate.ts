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

import { readFileSync, existsSync } from 'fs';
import 'dotenv/config';
import { parse as parseYaml } from 'yaml';
import { ConfigSchema } from '../src/config/schema.js';
import { validateEmbeddingConfig } from '../src/config/validate-embeddings.js';

interface CliArgs {
  config?: string;
  checkEnv: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = { checkEnv: false, help: false };
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--check-env') {
      args.checkEnv = true;
    } else if (arg === '--config' || arg === '-c') {
      args.config = process.argv[++i];
    }
  }
  return args;
}

function printHelp(): void {
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

const CONFIG_PATHS = ['config.yaml', 'config.yml', 'config/config.yaml', '.config.yaml'];

function findConfigFile(): string | null {
  for (const p of CONFIG_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

function main(): void {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }

  console.log('🔍 Validating ContextMCP configuration\n');
  console.log('═'.repeat(50));

  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Locate config file.
  const configPath = args.config || findConfigFile();
  if (!configPath) {
    console.error('\n❌ Configuration file not found.');
    console.error(`   Looked for: ${CONFIG_PATHS.join(', ')}`);
    process.exit(1);
  }
  console.log(`\n📄 Config file: ${configPath}`);
  if (!existsSync(configPath)) {
    console.error(`\n❌ File does not exist: ${configPath}`);
    process.exit(1);
  }

  // 2. Parse YAML.
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(configPath, 'utf-8'));
  } catch (error) {
    console.error(`\n❌ Failed to parse YAML: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  // 3. Structural validation (Zod). Collect all issues instead of exiting.
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      errors.push(`${path}: ${issue.message}`);
    }
  } else {
    // 4. Semantic embedding validation (only meaningful if structure is valid).
    const embeddingCheck = validateEmbeddingConfig(parsed.data.embeddings, {
      checkEnv: args.checkEnv,
    });
    errors.push(...embeddingCheck.errors);
    warnings.push(...embeddingCheck.warnings);

    // Helpful summary of what was validated.
    console.log(`\n✓ ${parsed.data.sources.length} source(s) configured`);
    console.log(
      `✓ Embeddings: ${parsed.data.embeddings.provider} / ${parsed.data.embeddings.model} ` +
        `(${parsed.data.embeddings.dimensions} dims)`
    );
    console.log(`✓ Vector DB: ${parsed.data.vectordb.provider} / ${parsed.data.vectordb.indexName}`);
  }

  // 5. Report.
  console.log('\n' + '═'.repeat(50));
  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`   • ${w}`);
  }

  if (errors.length > 0) {
    console.error(`\n❌ ${errors.length} error(s):`);
    for (const e of errors) console.error(`   • ${e}`);
    console.error('\nConfiguration is INVALID.');
    process.exit(1);
  }

  console.log('\n✅ Configuration is valid.');
}

main();
