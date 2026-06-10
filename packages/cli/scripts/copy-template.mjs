// Copies the monorepo template (packages/template) into this package as
// ./template so it ships in the npm tarball (see "files" in package.json).
// Runs automatically via the "prepack" script before `npm pack` / `npm publish`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '../../template');
const destDir = path.resolve(__dirname, '../template');

// `--clean` (postpack): remove the copy so a stale ./template never shadows
// the live packages/template during monorepo development.
if (process.argv.includes('--clean')) {
  fs.rmSync(destDir, { recursive: true, force: true });
  process.exit(0);
}

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'data',
  '.temp-repos',
  '.wrangler',
  '.vscode',
  '.idea',
]);

const EXCLUDED_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'config.yaml',
  '.env',
  '.env.local',
]);

function excluded(src) {
  const name = path.basename(src);
  if (EXCLUDED_FILES.has(name)) return true;
  if (name.startsWith('.env.') && !name.endsWith('.example')) return true;
  if (name.endsWith('.log')) return true;
  if (name.endsWith('.tgz')) return true;
  const stat = fs.statSync(src);
  return stat.isDirectory() && EXCLUDED_DIRS.has(name);
}

if (!fs.existsSync(path.join(srcDir, 'package.json'))) {
  console.error(`Template source not found at ${srcDir}`);
  process.exit(1);
}

fs.rmSync(destDir, { recursive: true, force: true });
fs.cpSync(srcDir, destDir, { recursive: true, filter: (src) => !excluded(src) });

// Sanity check: the copied template must be usable by `contextmcp init`.
for (const required of ['package.json', 'config.example.yaml', '.env.example', 'gitignore', 'src']) {
  if (!fs.existsSync(path.join(destDir, required))) {
    console.error(`Copied template is missing required entry: ${required}`);
    process.exit(1);
  }
}

console.log(`Copied template to ${destDir}`);
