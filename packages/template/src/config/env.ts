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
 * Validate embedding-related environment variables
 */
export function validateEmbeddingEnv(provider: 'openai' | 'gemini' = 'openai'): void {
  const apiKeyVar = provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
  validateEnv([apiKeyVar, 'PINECONE_API_KEY']);
}

