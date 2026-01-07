/**
 * Init Command
 *
 * Scaffolds a new ContextMCP project by copying the template
 * and customizing it based on user input.
 */

import path from 'path';
import fs from 'fs-extra';
import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface InitOptions {
  install?: boolean;
}

function runCommand(command: string, cwd: string): boolean {
  try {
    execSync(command, { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function printBanner() {
  console.log('');
  console.log(chalk.hex('#4e94f8').bold('    ______            __            __  __  _______________'));
  console.log(chalk.hex('#4e94f8').bold('   / ____/___  ____  / /____  _  __/ /_/  |/  / ____/ __ \\'));
  console.log(chalk.hex('#4e94f8').bold('  / /   / __ \\/ __ \\/ __/ _ \\| |/_/ __/ /|_/ / /   / /_/ /'));
  console.log(chalk.hex('#4e94f8').bold(' / /___/ /_/ / / / / /_/  __/>  </ /_/ /  / / /___/ ____/ '));
  console.log(chalk.hex('#4e94f8').bold(' \\____/\\____/_/ /_/\\__/\\___/_/|_|\\__/_/  /_/\\____/_/      '));
  console.log('');
  console.log(chalk.dim('        Self-hosted MCP server for your documentation'));
  console.log('');
}

function printNextSteps(projectName: string) {
  console.log('');
  console.log(chalk.bold.green('  ✅ Project created successfully!'));
  console.log('');
  console.log(chalk.bold('  ┌─────────────────────────────────────────────────────────────┐'));
  console.log(chalk.bold('  │                        Next Steps                           │'));
  console.log(chalk.bold('  └─────────────────────────────────────────────────────────────┘'));
  console.log('');

  // Step 1: Navigate
  console.log(chalk.bold.white('  1. Navigate to your project'));
  console.log(chalk.cyan(`     cd ${projectName}`));
  console.log('');

  // Step 2: Environment
  console.log(chalk.bold.white('  2. Set up environment variables'));
  console.log(chalk.cyan('     cp .env.example .env'));
  console.log(chalk.dim('     # Edit .env with your PINECONE_API_KEY and OPENAI_API_KEY'));
  console.log('');

  // Step 3: Configure
  console.log(chalk.bold.white('  3. Configure your documentation sources'));
  console.log(chalk.dim('     # Edit config.yaml to add your GitHub repos, docs, APIs'));
  console.log('');

  // Step 4: Index
  console.log(chalk.bold.white('  4. Index your documentation'));
  console.log(chalk.cyan('     npm run reindex'));
  console.log('');

  // Step 5: Deploy
  console.log(chalk.bold.white('  5. Deploy the MCP server'));
  console.log(chalk.cyan('     cd cloudflare-worker'));
  console.log(chalk.cyan('     npm install'));
  console.log(chalk.cyan('     wrangler secret put PINECONE_API_KEY'));
  console.log(chalk.cyan('     wrangler secret put OPENAI_API_KEY'));
  console.log(chalk.cyan('     npm run deploy'));
  console.log('');

  console.log(chalk.bold('  ┌─────────────────────────────────────────────────────────────┐'));
  console.log(chalk.bold('  │                        Resources                            │'));
  console.log(chalk.bold('  └─────────────────────────────────────────────────────────────┘'));
  console.log('');
  console.log(`  ${chalk.dim('Documentation:')}  ${chalk.cyan.underline('https://contextmcp.ai/docs')}`);
  console.log(`  ${chalk.dim('GitHub:')}         ${chalk.cyan.underline('https://github.com/dodopayments/contextmcp')}`);
  console.log('');
}

export async function initCommand(projectName?: string, options: InitOptions = {}) {
  printBanner();

  // Get project name
  let name = projectName;
  if (!name) {
    const response = await prompts({
      type: 'text',
      name: 'projectName',
      message: 'Project name',
      initial: 'my-docs-mcp',
      validate: value => {
        if (!value) return 'Project name is required';
        if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
          return 'Project name can only contain letters, numbers, hyphens, and underscores';
        }
        return true;
      },
    });

    if (!response.projectName) {
      console.log(chalk.yellow('\n  ✖ Cancelled\n'));
      process.exit(0);
    }
    name = response.projectName;
  }

  // Use project name as Pinecone index name
  const pineconeIndex = name!.replace(/[^a-z0-9-]/gi, '-').toLowerCase();

  const targetDir = path.resolve(process.cwd(), name!);

  // Check if directory exists
  if (fs.existsSync(targetDir)) {
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: `Directory ${chalk.cyan(name)} already exists. Overwrite?`,
      initial: false,
    });

    if (!overwrite) {
      console.log(chalk.yellow('\n  ✖ Cancelled\n'));
      process.exit(0);
    }

    const removeSpinner = ora('Removing existing directory...').start();
    await fs.remove(targetDir);
    removeSpinner.succeed('Removed existing directory');
  }

  console.log('');

  // Step 1: Copy template
  const templateSpinner = ora('Copying project template...').start();
  const templateDir = path.resolve(__dirname, '../../template');

  try {
    await fs.copy(templateDir, targetDir);
    templateSpinner.succeed('Project template copied');
  } catch (error) {
    templateSpinner.fail('Failed to copy template');
    throw error;
  }

  // Step 2: Configure project
  const configSpinner = ora('Configuring project...').start();

  try {
    // Update package.json
    const pkgPath = path.join(targetDir, 'package.json');
    const pkg = await fs.readJson(pkgPath);
    pkg.name = name;
    delete pkg.private;
    await fs.writeJson(pkgPath, pkg, { spaces: 2 });

    // Create config.yaml from example
    const configExamplePath = path.join(targetDir, 'config.example.yaml');
    const configPath = path.join(targetDir, 'config.yaml');

    if (await fs.pathExists(configExamplePath)) {
      let configContent = await fs.readFile(configExamplePath, 'utf-8');
      configContent = configContent.replace(/indexName:\s*\S+/, `indexName: ${pineconeIndex}`);
      await fs.writeFile(configPath, configContent);
    }

    // Rename gitignore
    const gitignorePath = path.join(targetDir, 'gitignore');
    const dotGitignorePath = path.join(targetDir, '.gitignore');

    if (await fs.pathExists(gitignorePath)) {
      await fs.rename(gitignorePath, dotGitignorePath);
    }

    configSpinner.succeed('Project configured');
  } catch (error) {
    configSpinner.fail('Failed to configure project');
    throw error;
  }

  // Step 3: Install dependencies
  if (options.install !== false) {
    const installSpinner = ora('Installing dependencies...').start();

    const success = runCommand('npm install', targetDir);

    if (success) {
      installSpinner.succeed('Dependencies installed');
    } else {
      installSpinner.warn('Could not install dependencies. Run "npm install" manually.');
    }
  }

  // Print next steps
  printNextSteps(name!);
}
