/**
 * Pure environment-readiness checks for the `doctor` script.
 *
 * Each function returns structured CheckResult(s) without touching the console,
 * process.exit, or the real filesystem/env directly (deps are injectable), so
 * the logic is fully unit-testable.
 */

import { ConfigSchema } from './schema.js';
import {
  validateEmbeddingConfig,
  EMBEDDING_PROVIDERS,
  type EmbeddingProvider,
} from './validate-embeddings.js';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckResult {
  status: CheckStatus;
  label: string;
  detail?: string;
}

export const MIN_NODE_MAJOR = 18;

/** Tally pass/warn/fail counts from a list of results. */
export function countResults(results: CheckResult[]): Record<CheckStatus, number> {
  return results.reduce(
    (acc, r) => {
      acc[r.status]++;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 } as Record<CheckStatus, number>
  );
}

/** True if any result failed. */
export function hasFailure(results: CheckResult[]): boolean {
  return results.some(r => r.status === 'fail');
}

/** Check a Node.js version string (e.g. "18.19.1") against MIN_NODE_MAJOR. */
export function checkNodeVersion(version: string, min: number = MIN_NODE_MAJOR): CheckResult {
  const major = parseInt(version.split('.')[0], 10);
  return major >= min
    ? { status: 'pass', label: 'Node.js version', detail: `v${version}` }
    : { status: 'fail', label: 'Node.js version', detail: `v${version} (requires >= ${min})` };
}

/** Check whether an environment variable is set. */
export function checkEnvVar(
  name: string,
  env: NodeJS.ProcessEnv,
  label = `Env: ${name}`
): CheckResult {
  return env[name]
    ? { status: 'pass', label, detail: 'set' }
    : { status: 'fail', label, detail: 'not set' };
}

/**
 * Validate parsed YAML config and produce check results: structural validity,
 * embedding consistency, and the provider's required API key env var.
 *
 * `raw` is the already-parsed YAML object. `env` defaults are injectable.
 */
export function checkConfig(raw: unknown, env: NodeJS.ProcessEnv): CheckResult[] {
  const results: CheckResult[] = [];

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    results.push({
      status: 'fail',
      label: 'Config is valid',
      detail: `${parsed.error.issues.length} schema error(s)`,
    });
    return results;
  }

  results.push({
    status: 'pass',
    label: 'Config is valid',
    detail: `${parsed.data.sources.length} source(s)`,
  });

  // Embedding consistency.
  const embeddingCheck = validateEmbeddingConfig(parsed.data.embeddings);
  if (embeddingCheck.errors.length === 0) {
    results.push({
      status: 'pass',
      label: 'Embedding config',
      detail: `${parsed.data.embeddings.provider}/${parsed.data.embeddings.model} (${parsed.data.embeddings.dimensions} dims)`,
    });
  } else {
    results.push({
      status: 'fail',
      label: 'Embedding config',
      detail: embeddingCheck.errors.join('; '),
    });
  }
  for (const w of embeddingCheck.warnings) {
    results.push({ status: 'warn', label: 'Embedding config', detail: w });
  }

  // Provider API key env var. Keyless providers (e.g. ollama) have a null
  // apiKeyEnvVar — emitting checkEnvVar(null) would produce a bogus "Env: null
  // not set" failure, so report that no key is required instead.
  const provider = parsed.data.embeddings.provider as EmbeddingProvider;
  const providerSpec = EMBEDDING_PROVIDERS[provider];
  if (providerSpec) {
    if (providerSpec.apiKeyEnvVar) {
      results.push(checkEnvVar(providerSpec.apiKeyEnvVar, env));
    } else {
      results.push({
        status: 'pass',
        label: `Provider key (${provider})`,
        detail: 'no API key required',
      });
    }
  }

  return results;
}
