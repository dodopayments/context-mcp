/**
 * Doctor Script
 *
 * Checks that the local environment is ready to run ContextMCP: Node version,
 * config file presence + validity, and required API key env vars for the
 * configured embedding provider and vector DB.
 *
 * Usage:
 *   npx tsx scripts/doctor.ts
 *   npx tsx scripts/doctor.ts --config path/to/config.yaml
 *
 * Exit codes:
 *   0  all checks passed (warnings allowed)
 *   1  one or more checks failed
 */

import { readFileSync, existsSync } from 'fs';
import 'dotenv/config';
import { parse as parseYaml } from 'yaml';
import {
  checkNodeVersion,
  checkEnvVar,
  checkConfig,
  countResults,
  hasFailure,
  type CheckResult,
} from '../src/config/doctor-checks.js';

interface CliArgs {
  config?: string;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = { help: false };
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--config' || arg === '-c') args.config = process.argv[++i];
  }
  return args;
}

function printHelp(): void {
  console.log(`
ContextMCP Doctor

Checks that your environment is ready to index and serve documentation.

Usage:
  npx tsx scripts/doctor.ts [options]

Options:
  --help, -h             Show this help message
  --config, -c <path>    Use a specific config file

Exit codes:
  0  all checks passed
  1  one or more checks failed
`);
}

const ICON = { pass: '✅', warn: '⚠️ ', fail: '❌' } as const;
const CONFIG_PATHS = ['config.yaml', 'config.yml', 'config/config.yaml', '.config.yaml'];

function findConfigFile(): string | null {
  for (const p of CONFIG_PATHS) if (existsSync(p)) return p;
  return null;
}

function render(results: CheckResult[]): void {
  for (const r of results) {
    console.log(`${ICON[r.status]} ${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
  }
}

function summarise(results: CheckResult[]): void {
  const { pass, warn, fail } = countResults(results);
  console.log('\n' + '═'.repeat(50));
  console.log(`\n${pass} passed, ${warn} warning(s), ${fail} failed`);
  if (hasFailure(results)) {
    console.error('\n❌ Environment is NOT ready. Fix the failed checks above.');
    process.exit(1);
  }
  console.log('\n✅ Environment is ready.');
}

function main(): void {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }

  console.log('🩺 ContextMCP Doctor\n');
  console.log('═'.repeat(50) + '\n');

  const results: CheckResult[] = [];

  // 1. Node.js version.
  results.push(checkNodeVersion(process.versions.node));

  // 2. Config file presence.
  const configPath = args.config || findConfigFile();
  if (!configPath || !existsSync(configPath)) {
    results.push({
      status: 'fail',
      label: 'Config file',
      detail: `not found (looked for ${CONFIG_PATHS.join(', ')})`,
    });
    render(results);
    summarise(results);
    return;
  }
  results.push({ status: 'pass', label: 'Config file', detail: configPath });

  // 3-4. Config parse/validate + embedding consistency + provider key.
  try {
    const raw = parseYaml(readFileSync(configPath, 'utf-8'));
    results.push(...checkConfig(raw, process.env));
  } catch (error) {
    results.push({
      status: 'fail',
      label: 'Config parses',
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  // 5. Vector DB key.
  results.push(checkEnvVar('PINECONE_API_KEY', process.env));

  render(results);
  summarise(results);
}

main();
