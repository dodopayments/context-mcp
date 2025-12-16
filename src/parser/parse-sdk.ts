import * as fs from 'fs';
import * as path from 'path';
import { DocChunk } from '../types/index.js';
import { parseSDKFile } from './chunkers/sdk-chunker.js';
import { cloneRepo, extractRepoInfo, ensureDir, TEMP_DIR, DATA_DIR } from './core/index.js';

interface RepoConfig {
  url: string;
  language: string;
}

const REPOSITORIES: RepoConfig[] = [
  { url: 'https://github.com/dodopayments/dodopayments-typescript', language: 'typescript' },
  { url: 'https://github.com/dodopayments/dodopayments-ruby', language: 'ruby' },
  { url: 'https://github.com/dodopayments/dodopayments-python', language: 'python' },
  { url: 'https://github.com/dodopayments/dodopayments-go', language: 'go' },
  { url: 'https://github.com/dodopayments/dodopayments-java', language: 'java' },
  { url: 'https://github.com/dodopayments/dodopayments-php', language: 'php' },
  { url: 'https://github.com/dodopayments/dodo-adapters', language: 'typescript' },
  { url: 'https://github.com/dodopayments/ingestion-blueprints', language: 'typescript' },
  { url: 'https://github.com/dodopayments/dodopayments-csharp', language: 'csharp' },
];

const SKIP_DIRS = new Set([
  '.git',
  '.github',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
]);
const SKIP_FILES = new Set([
  'security.md',
  'code_of_conduct.md',
  'issue_template.md',
  'pull_request_template.md',
  'license.md',
  'contributing.md',
  'api.md',
]);
const SKIP_INTERNAL_DIRS = new Set([
  'src/internal',
  'src/core',
  'internal',
  'test',
  'tests',
  '__tests__',
  'spec',
]);

function findDocFilesRecursive(dir: string, baseDir: string = dir): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      if (SKIP_INTERNAL_DIRS.has(relativePath.toLowerCase())) continue;
      files.push(...findDocFilesRecursive(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      if (!SKIP_FILES.has(entry.name.toLowerCase())) {
        files.push(relativePath);
      }
    }
  }

  return files;
}

function parseDocFile(
  filePath: string,
  fileName: string,
  repoInfo: { owner: string; name: string; fullName: string },
  language: string
): DocChunk[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const baseName = path.basename(fileName).toLowerCase();
  const sourceUrl = `https://github.com/${repoInfo.fullName}/blob/main/${fileName}`;

  const dirName = path.dirname(fileName);
  const packageName = dirName !== '.' ? path.basename(dirName) : null;
  const contextualRepoName =
    packageName && packageName !== repoInfo.name
      ? `${repoInfo.fullName}/${packageName}`
      : repoInfo.fullName;

  return parseSDKFile(content, sourceUrl, contextualRepoName, baseName, language);
}

async function main() {
  console.log('Parsing SDK repos...\n');

  ensureDir(TEMP_DIR);

  const allChunks: DocChunk[] = [];
  const stats: { repo: string; language: string; files: number; chunks: number }[] = [];

  for (const repo of REPOSITORIES) {
    const repoInfo = extractRepoInfo(repo.url);
    const repoDir = path.join(TEMP_DIR, repoInfo.name);

    try {
      cloneRepo(repo.url, repoDir);

      const docFiles = findDocFilesRecursive(repoDir);
      if (docFiles.length === 0) continue;

      let repoChunks = 0;
      for (const docFile of docFiles) {
        const chunks = parseDocFile(path.join(repoDir, docFile), docFile, repoInfo, repo.language);
        allChunks.push(...chunks);
        repoChunks += chunks.length;
      }

      stats.push({
        repo: repoInfo.fullName,
        language: repo.language,
        files: docFiles.length,
        chunks: repoChunks,
      });
      console.log(`  ${repoInfo.name}: ${repoChunks} chunks`);
    } catch (error) {
      console.error(`  Error: ${repo.url}`, error);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    totalChunks: allChunks.length,
    repositories: stats,
    chunks: allChunks,
  };

  ensureDir(DATA_DIR);
  fs.writeFileSync(path.join(DATA_DIR, 'sdk-index.json'), JSON.stringify(output, null, 2));
  console.log(`\nTotal: ${allChunks.length} chunks`);
}

main().catch(console.error);
