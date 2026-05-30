/**
 * Embedding configuration validation
 *
 * Catches provider / model / dimension / env-var mismatches *before* a reindex
 * starts, instead of failing late after partially writing vectors. Pure
 * functions (no process.exit, no I/O) so they can be reused by the loader,
 * the `validate` / `doctor` commands, and unit tests.
 */

import type { ContextMCPConfig } from './schema.js';

export type EmbeddingProvider = 'openai' | 'gemini' | 'cohere' | 'voyage' | 'ollama';

/**
 * How a model's output dimensions are constrained.
 *
 * - `fixed`: the model emits exactly these dimensions and nothing else
 *   (e.g. `text-embedding-ada-002` is always 1536). A configured value outside
 *   the list is a hard error.
 * - `range`: the model supports reducing/choosing the output dimension to any
 *   integer within `[min, max]` (e.g. OpenAI's `text-embedding-3-*` accept any
 *   `dimensions` from 1..max via the API param). Only out-of-range values are
 *   errors; in-range non-default values are allowed silently.
 */
export type DimensionConstraint =
  | { kind: 'fixed'; values: number[]; defaultDimension: number }
  | { kind: 'range'; min: number; max: number; defaultDimension: number };

export interface ModelSpec {
  /** How output dimensions are constrained for this model. */
  dimensions: DimensionConstraint;
}

export interface ProviderSpec {
  /**
   * Environment variable holding the provider's API key, or `null` for
   * providers that need no key (e.g. a local Ollama server).
   */
  apiKeyEnvVar: string | null;
  /** Known models keyed by model id. */
  models: Record<string, ModelSpec>;
}

const range = (min: number, max: number, defaultDimension: number): DimensionConstraint => ({
  kind: 'range',
  min,
  max,
  defaultDimension,
});

const fixed = (values: number[], defaultDimension: number): DimensionConstraint => ({
  kind: 'fixed',
  values,
  defaultDimension,
});

/**
 * Known embedding providers and their supported models/dimensions.
 *
 * OpenAI's `text-embedding-3-*` and Gemini's embedding models support reducing
 * dimensions to any value within a range via an API param, so they use `range`
 * constraints rather than a fixed whitelist — picking e.g. 1536 to match an
 * existing index is valid and must not be rejected. Older fixed-size models
 * (`text-embedding-ada-002`) use exact `fixed` lists.
 *
 * Providers without a known model registry (cohere/voyage/ollama) are still
 * listed so the provider itself validates; their model dimensions are treated
 * as unknown (a warning, never a hard error) since they evolve quickly and run
 * against user-chosen local/hosted models.
 */
export const EMBEDDING_PROVIDERS: Record<EmbeddingProvider, ProviderSpec> = {
  openai: {
    apiKeyEnvVar: 'OPENAI_API_KEY',
    models: {
      'text-embedding-3-large': { dimensions: range(1, 3072, 3072) },
      'text-embedding-3-small': { dimensions: range(1, 1536, 1536) },
      'text-embedding-ada-002': { dimensions: fixed([1536], 1536) },
    },
  },
  gemini: {
    apiKeyEnvVar: 'GEMINI_API_KEY',
    models: {
      'gemini-embedding-2-preview': { dimensions: range(1, 3072, 3072) },
    },
  },
  cohere: {
    apiKeyEnvVar: 'COHERE_API_KEY',
    // Cohere embedding models evolve quickly; dimensions are validated against
    // the index at reindex time rather than a hardcoded list here.
    models: {},
  },
  voyage: {
    apiKeyEnvVar: 'VOYAGE_API_KEY',
    models: {},
  },
  ollama: {
    // Local server — no API key required.
    apiKeyEnvVar: null,
    models: {},
  },
};

/**
 * In-range dimensions below this are flagged with a soft warning (likely a typo
 * such as 15 vs 1536). Not an error — some models legitimately use small dims.
 */
const LOW_DIMENSION_WARNING_THRESHOLD = 64;

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

  // 2. Model: warn (not error) on unknown model so new models aren't blocked.
  //    For known models, validate dimensions against the model's constraint:
  //    `fixed` models reject any value off the list; `range` models reject only
  //    out-of-range values (so e.g. OpenAI dimension reduction stays valid).
  const knownModels = Object.keys(providerSpec.models);
  const modelSpec = providerSpec.models[model];
  if (!modelSpec) {
    // Providers with no registered models (cohere/voyage/ollama) shouldn't emit
    // a noisy "known models: " list — dimensions are validated against the
    // index at reindex time for those.
    if (knownModels.length > 0) {
      warnings.push(
        `Unknown model "${model}" for provider "${provider}". Known models: ${knownModels.join(
          ', '
        )}. Skipping dimension validation for this model.`
      );
    }
  } else {
    const c = modelSpec.dimensions;
    if (c.kind === 'fixed' && !c.values.includes(dimensions)) {
      errors.push(
        `embeddings.dimensions=${dimensions} is not valid for ${provider}/${model}. ` +
          `Supported dimensions: ${c.values.join(', ')} (recommended: ${c.defaultDimension}).`
      );
    } else if (c.kind === 'range' && (dimensions < c.min || dimensions > c.max)) {
      errors.push(
        `embeddings.dimensions=${dimensions} is out of range for ${provider}/${model}. ` +
          `Supported range: ${c.min}–${c.max} (recommended: ${c.defaultDimension}).`
      );
    } else if (c.kind === 'range' && dimensions < LOW_DIMENSION_WARNING_THRESHOLD) {
      // In-range but suspiciously small — the floor is intentionally permissive
      // (some models go very low), but a value this tiny is usually a typo like
      // `15` instead of `1536`. Warn, never error, so legitimate reductions pass.
      warnings.push(
        `embeddings.dimensions=${dimensions} is unusually low for ${provider}/${model} ` +
          `(recommended: ${c.defaultDimension}). Double-check this isn't a typo.`
      );
    }
  }

  // 3. Optional env-var presence check (skipped for keyless providers).
  if (options.checkEnv && providerSpec.apiKeyEnvVar) {
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
