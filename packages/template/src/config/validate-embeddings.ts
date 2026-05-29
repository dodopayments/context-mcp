/**
 * Embedding configuration validation
 *
 * Catches provider / model / dimension / env-var mismatches *before* a reindex
 * starts, instead of failing late after partially writing vectors. Pure
 * functions (no process.exit, no I/O) so they can be reused by the loader,
 * the `validate` / `doctor` commands, and unit tests.
 */

import type { ContextMCPConfig } from './schema.js';

export type EmbeddingProvider = 'openai' | 'gemini';

export interface ModelSpec {
  /** Allowed output dimensions for this model. */
  dimensions: number[];
  /** Default/recommended dimension. */
  defaultDimension: number;
}

export interface ProviderSpec {
  /** Environment variable holding the provider's API key. */
  apiKeyEnvVar: string;
  /** Known models keyed by model id. */
  models: Record<string, ModelSpec>;
}

/**
 * Known embedding providers and their supported models/dimensions.
 *
 * OpenAI's text-embedding-3-* models support reducing dimensions via the
 * `dimensions` param. Gemini's gemini-embedding-2-preview supports
 * outputDimensionality up to 3072.
 */
export const EMBEDDING_PROVIDERS: Record<EmbeddingProvider, ProviderSpec> = {
  openai: {
    apiKeyEnvVar: 'OPENAI_API_KEY',
    models: {
      'text-embedding-3-large': { dimensions: [256, 1024, 3072], defaultDimension: 3072 },
      'text-embedding-3-small': { dimensions: [512, 1536], defaultDimension: 1536 },
      'text-embedding-ada-002': { dimensions: [1536], defaultDimension: 1536 },
    },
  },
  gemini: {
    apiKeyEnvVar: 'GEMINI_API_KEY',
    models: {
      'gemini-embedding-2-preview': { dimensions: [768, 1536, 3072], defaultDimension: 3072 },
    },
  },
};

export interface EmbeddingValidationResult {
  /** Hard problems that will cause a failed or corrupt reindex. */
  errors: string[];
  /** Soft problems / things worth double-checking (unknown model, etc.). */
  warnings: string[];
}

export interface ValidateEmbeddingOptions {
  /**
   * When true, also validate that the provider's API key env var is present.
   * Off by default so config-only validation (no secrets) still works.
   */
  checkEnv?: boolean;
  /** Env source, defaults to process.env (injectable for tests). */
  env?: NodeJS.ProcessEnv;
}

/**
 * Validate the embeddings section of a config for internal consistency.
 */
export function validateEmbeddingConfig(
  embeddings: ContextMCPConfig['embeddings'],
  options: ValidateEmbeddingOptions = {}
): EmbeddingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { provider, model, dimensions } = embeddings;

  // 1. Provider must be known.
  const providerSpec = EMBEDDING_PROVIDERS[provider as EmbeddingProvider];
  if (!providerSpec) {
    errors.push(
      `Unknown embeddings.provider "${provider}". Supported providers: ${Object.keys(
        EMBEDDING_PROVIDERS
      ).join(', ')}.`
    );
    return { errors, warnings };
  }

  // 2. Model: warn (not error) on unknown model so new models aren't blocked,
  //    but validate dimensions strictly when the model is known.
  const modelSpec = providerSpec.models[model];
  if (!modelSpec) {
    warnings.push(
      `Unknown model "${model}" for provider "${provider}". Known models: ${Object.keys(
        providerSpec.models
      ).join(', ')}. Skipping dimension validation for this model.`
    );
  } else if (!modelSpec.dimensions.includes(dimensions)) {
    errors.push(
      `embeddings.dimensions=${dimensions} is not valid for ${provider}/${model}. ` +
        `Supported dimensions: ${modelSpec.dimensions.join(', ')} ` +
        `(recommended: ${modelSpec.defaultDimension}).`
    );
  }

  // 3. Optional env-var presence check.
  if (options.checkEnv) {
    const env = options.env ?? process.env;
    if (!env[providerSpec.apiKeyEnvVar]) {
      errors.push(
        `Missing ${providerSpec.apiKeyEnvVar} — required when embeddings.provider is "${provider}".`
      );
    }
  }

  return { errors, warnings };
}

/**
 * Validate that the embeddings dimension matches the vector DB index dimension,
 * when the index dimension is known (e.g. fetched from Pinecone stats).
 */
export function validateDimensionMatch(
  configuredDimensions: number,
  indexDimension: number | undefined,
  indexName: string
): EmbeddingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (indexDimension !== undefined && indexDimension !== configuredDimensions) {
    errors.push(
      `Dimension mismatch: embeddings.dimensions=${configuredDimensions} but Pinecone index ` +
        `"${indexName}" has dimension ${indexDimension}. Recreate the index or change ` +
        `embeddings.dimensions to ${indexDimension}.`
    );
  }

  return { errors, warnings };
}
