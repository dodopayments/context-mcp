/**
 * Pure config-validation logic, extracted from scripts/validate.ts so it can be
 * unit-tested without spawning a process or touching argv/stdout.
 */

import { existsSync, readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { ConfigSchema } from './schema.js';
import { validateEmbeddingConfig } from './validate-embeddings.js';

/** Default locations searched for a config file, in priority order. */
export const CONFIG_PATHS = ['config.yaml', 'config.yml', 'config/config.yaml', '.config.yaml'];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Short human-readable summary lines when the config parsed successfully. */
  summary: string[];
}

/**
 * Find the first existing config file from CONFIG_PATHS.
 * `exists` defaults to fs.existsSync but is injectable for testing.
 */
export function findConfigFile(
  paths: string[] = CONFIG_PATHS,
  exists: (p: string) => boolean = existsSync
): string | null {
  for (const p of paths) {
    if (exists(p)) return p;
  }
  return null;
}

/**
 * Validate a raw (already-parsed) config object: structural (Zod) checks plus
 * semantic embedding checks. Aggregates all issues rather than throwing.
 */
export function validateConfigObject(raw: unknown, opts: { checkEnv?: boolean } = {}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const summary: string[] = [];

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      errors.push(`${path}: ${issue.message}`);
    }
    return { valid: false, errors, warnings, summary };
  }

  const embeddingCheck = validateEmbeddingConfig(parsed.data.embeddings, {
    checkEnv: opts.checkEnv,
  });
  errors.push(...embeddingCheck.errors);
  warnings.push(...embeddingCheck.warnings);

  summary.push(`${parsed.data.sources.length} source(s) configured`);
  summary.push(
    `Embeddings: ${parsed.data.embeddings.provider} / ${parsed.data.embeddings.model} ` +
      `(${parsed.data.embeddings.dimensions} dims)`
  );
  summary.push(`Vector DB: ${parsed.data.vectordb.provider} / ${parsed.data.vectordb.indexName}`);

  return { valid: errors.length === 0, errors, warnings, summary };
}

/**
 * Parse YAML text and validate it. Returns a YAML-parse error as a validation
 * error rather than throwing.
 */
export function validateConfigText(yamlText: string, opts: { checkEnv?: boolean } = {}): ValidationResult {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`],
      warnings: [],
      summary: [],
    };
  }
  return validateConfigObject(raw, opts);
}

/**
 * Validate a config file on disk. Returns a file-not-found error rather than
 * throwing/exiting.
 */
export function validateConfigFile(filePath: string, opts: { checkEnv?: boolean } = {}): ValidationResult {
  if (!existsSync(filePath)) {
    return { valid: false, errors: [`File does not exist: ${filePath}`], warnings: [], summary: [] };
  }
  return validateConfigText(readFileSync(filePath, 'utf-8'), opts);
}
