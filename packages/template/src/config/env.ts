/**
 * Shared environment validation utilities
 */

/**
 * Validate that required environment variables are set
 * Exits process with clear error message if any are missing
 */
export function validateEnv(required: string[]): void {
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nCreate a .env file with these variables or set them in your environment.');
    process.exit(1);
  }
}

/**
 * Map an embedding provider to its required API key environment variable.
 * Providers that need no API key (e.g. local Ollama) are absent from this map.
 */
export const PROVIDER_API_KEY_ENV: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  cohere: 'COHERE_API_KEY',
  voyage: 'VOYAGE_API_KEY',
};

export type EmbeddingProviderName = 'openai' | 'gemini' | 'cohere' | 'voyage' | 'ollama';

/**
 * Validate embedding-related environment variables
 */
export function validateEmbeddingEnv(provider: EmbeddingProviderName = 'openai'): void {
  // Ollama runs locally and needs no API key.
  const apiKeyVar = PROVIDER_API_KEY_ENV[provider];
  const required = apiKeyVar ? [apiKeyVar, 'PINECONE_API_KEY'] : ['PINECONE_API_KEY'];
  validateEnv(required);
}

