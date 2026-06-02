#!/usr/bin/env node
/**
 * ContextMCP CLI
 *
 * Scaffold a self-hosted MCP server for your documentation.
 *
 * Usage:
 *   npx contextmcp init [project-name]
 *   npx contextmcp init my-docs-mcp
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initCommand } from './commands/init.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getPackageVersion(): string {
  const packageJsonPath = path.resolve(__dirname, '../package.json');

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
    return packageJson.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const program = new Command();

program
  .name('contextmcp')
  .description('CLI to scaffold a ContextMCP documentation RAG server')
  .version(getPackageVersion());

program
  .command('init [project-name]')
  .description('Scaffold a new ContextMCP project')
  .option('--no-install', 'Skip npm install')
  .action(async (projectName, options) => {
    try {
      await initCommand(projectName, options);
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
