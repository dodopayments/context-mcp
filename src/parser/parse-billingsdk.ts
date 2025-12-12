import * as fs from 'fs';
import * as path from 'path';
import { parseBillingSdkDocs } from './chunkers/billingsdk-chunker.js';
import { cloneRepo, ensureDir, TEMP_DIR, DATA_DIR } from './core/index.js';

const REPO_URL = 'https://github.com/dodopayments/billingsdk';

async function main() {
  console.log('Parsing billingsdk...\n');
  
  ensureDir(TEMP_DIR);
  const repoDir = path.join(TEMP_DIR, 'billingsdk');
  cloneRepo(REPO_URL, repoDir);
  
  const chunks = await parseBillingSdkDocs(repoDir);
  
  if (chunks.length === 0) {
    console.error('No chunks generated');
    process.exit(1);
  }
  
  const output = {
    generatedAt: new Date().toISOString(),
    repository: 'dodopayments/billingsdk',
    totalChunks: chunks.length,
    categories: [...new Set(chunks.map(c => c.category))].sort(),
    chunks
  };
  
  ensureDir(DATA_DIR);
  fs.writeFileSync(path.join(DATA_DIR, 'billingsdk-index.json'), JSON.stringify(output, null, 2));
  console.log(`Generated ${chunks.length} chunks`);
}

main().catch(console.error);
