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
import { ConfigSchema } from '../src/config/schema.js';
import {
  validateEmbeddingConfig,
  EMBEDDING_PROVIDERS,
  type EmbeddingProvider,
} from '../src/config/validate-embeddings.js';

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

type Status = 'pass' | 'warn' | 'fail';

const ICON: Record<Status, string> = { pass: '✅', warn: '⚠️ ', fail: '❌' };

class Report {
  private results: { status: Status; label: string; detail?: string }[] = [];

  add(status: Status, label: string, detail?: string): void {
    this.results.push({ status, label, detail });
    console.log(`${ICON[status]} ${label}${detail ? ` — ${detail}` : ''}`);
  }

  get failed(): boolean {
    return this.results.some(r => r.status === 'fail');
  }

  get counts(): Record<Status, number> {
    return this.results.reduce(
      (acc, r) => ({ ...acc, [r.status]: acc[r.status] + 1 }),
      { pass: 0, warn: 0, fail: 0 } as Record<Status, number>
    );
  }
}

const CONFIG_PATHS = ['config.yaml', 'config.yml', 'config/config.yaml', '.config.yaml'];

function findConfigFile(): string | null {
  for (const p of CONFIG_PATHS) if (existsSync(p)) return p;
  return null;
}

const MIN_NODE_MAJOR = 18;

function main(): void {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }

  console.log('🩺 ContextMCP Doctor\n');
  console.log('═'.repeat(50) + '\n');

  const report = new Report();

  // --- 1. Node.js version ---------------------------------------------------
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= MIN_NODE_MAJOR) {
    report.add('pass', 'Node.js version', `v${process.versions.node}`);
  } else {
    report.add(
      'fail',
      'Node.js version',
      `v${process.versions.node} (requires >= ${MIN_NODE_MAJOR})`
    );
  }

  // --- 2. Config file presence ----------------------------------------------
  const configPath = args.config || findConfigFile();
  if (!configPath || !existsSync(configPath)) {
    report.add('fail', 'Config file', `not found (looked for ${CONFIG_PATHS.join(', ')})`);
    summarise(report);
    return;
  }
  report.add('pass', 'Config file', configPath);

  // --- 3. Config parses + validates -----------------------------------------
  let parsedData: ReturnType<typeof ConfigSchema.parse> | undefined;
  try {
    const raw = parseYaml(readFileSync(configPath, 'utf-8'));
    const parsed = ConfigSchema.safeParse(raw);
    if (parsed.success) {
      parsedData = parsed.data;
      report.add('pass', 'Config is valid', `${parsed.data.sources.length} source(s)`);
    } else {
      report.add('fail', 'Config is valid', `${parsed.error.issues.length} schema error(s)`);
      for (const issue of parsed.error.issues) {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        console.log(`     • ${path}: ${issue.message}`);
      }
    }
  } catch (error) {
    report.add('fail', 'Config parses', error instanceof Error ? error.message : String(error));
  }

  // --- 4. Embedding consistency + provider key ------------------------------
  if (parsedData) {
    const provider = parsedData.embeddings.provider as EmbeddingProvider;
    const embeddingCheck = validateEmbeddingConfig(parsedData.embeddings);
    if (embeddingCheck.errors.length === 0) {
      report.add(
        'pass',
        'Embedding config',
        `${parsedData.embeddings.provider}/${parsedData.embeddings.model} (${parsedData.embeddings.dimensions} dims)`
      );
    } else {
      report.add('fail', 'Embedding config', embeddingCheck.errors.join('; '));
    }
    for (const w of embeddingCheck.warnings) report.add('warn', 'Embedding config', w);

    // Provider API key env var.
    const providerSpec = EMBEDDING_PROVIDERS[provider];
    if (providerSpec) {
      const keyVar = providerSpec.apiKeyEnvVar;
      report.add(
        process.env[keyVar] ? 'pass' : 'fail',
        `Env: ${keyVar}`,
        process.env[keyVar] ? 'set' : 'not set'
      );
    }
  }

  // --- 5. Pinecone key ------------------------------------------------------
  report.add(
    process.env.PINECONE_API_KEY ? 'pass' : 'fail',
    'Env: PINECONE_API_KEY',
    process.env.PINECONE_API_KEY ? 'set' : 'not set'
  );

  summarise(report);
}

function summarise(report: Report): void {
  const { pass, warn, fail } = report.counts;
  console.log('\n' + '═'.repeat(50));
  console.log(`\n${pass} passed, ${warn} warning(s), ${fail} failed`);
  if (report.failed) {
    console.error('\n❌ Environment is NOT ready. Fix the failed checks above.');
    process.exit(1);
  }
  console.log('\n✅ Environment is ready.');
}

main();
