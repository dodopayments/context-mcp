/**
 * ContextMCP Configuration Loader
 *
 * Loads and validates config.yaml configuration file.
 * Supports environment variable substitution in config values.
 */

import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { ConfigSchema, ContextMCPConfig } from './schema.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const CONFIG_PATHS = [
  'config.yaml',
  'config.yml',
  'config/config.yaml',
  '.config.yaml'
];

// =============================================================================
// ENVIRONMENT VARIABLE SUBSTITUTION
// =============================================================================

/**
 * Replace ${VAR} and ${VAR:-default} patterns with environment variable values
 */
function substituteEnvVars(content: string): string {
  return content.replace(/\$\{([^}]+)\}/g, (match, expr) => {
    // Handle default value syntax: ${VAR:-default}
    const [varName, defaultValue] = expr.split(':-');
    const envValue = process.env[varName.trim()];

    if (envValue !== undefined) {
      return envValue;
    }

    if (defaultValue !== undefined) {
      return defaultValue;
    }

    // Keep original if no env var and no default
    return match;
  });
}

// =============================================================================
// CONFIG LOADER
// =============================================================================

/**
 * Find the configuration file in standard locations
 */
function findConfigFile(): string | null {
  for (const configPath of CONFIG_PATHS) {
    if (existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

/**
 * Load and validate ContextMCP configuration
 *
 * @param customPath - Optional custom path to config file
 * @returns Validated configuration object
 * @throws Error if config file not found or validation fails
 */
export function loadConfig(customPath?: string): ContextMCPConfig {
  const configPath = customPath || findConfigFile();

  if (!configPath) {
    console.error('❌ Configuration file not found.');
    console.error(`   Looked for: ${CONFIG_PATHS.join(', ')}`);
    console.error('');
    console.error('   Create a config.yaml file or copy from config.example.yaml');
    process.exit(1);
  }

  // Read and substitute environment variables
  let content = readFileSync(configPath, 'utf-8');
  content = substituteEnvVars(content);

  // Parse YAML
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (error) {
    console.error(`❌ Failed to parse YAML: ${error}`);
    process.exit(1);
  }

  // Validate with Zod
  const parsed = ConfigSchema.safeParse(raw);

  if (!parsed.success) {
    console.error('❌ Configuration validation failed:');
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      console.error(`   • ${path}: ${issue.message}`);
    }
    process.exit(1);
  }

  return parsed.data;
}

/**
 * Validate configuration without exiting on error
 * Useful for testing and programmatic validation
 */
export function validateConfig(
  config: unknown
): { success: true; data: ContextMCPConfig } | { success: false; errors: string[] } {
  const parsed = ConfigSchema.safeParse(config);

  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  return {
    success: false,
    errors: parsed.error.issues.map(e => `${String(e.path.join('.'))}: ${e.message}`),
  };
}

/**
 * Check if a config file exists
 */
export function configExists(customPath?: string): boolean {
  return customPath ? existsSync(customPath) : findConfigFile() !== null;
}
