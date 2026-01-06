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
import { initCommand } from './commands/init.js';

const program = new Command();

program
  .name('contextmcp')
  .description('CLI to scaffold a ContextMCP documentation RAG server')
  .version('0.1.0');

program
  .command('init [project-name]')
  .description('Scaffold a new ContextMCP project')
  .option('--pinecone-index <name>', 'Pinecone index name')
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
