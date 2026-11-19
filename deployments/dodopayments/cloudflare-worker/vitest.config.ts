import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const stubs = fileURLToPath(new URL('./test/cloudflare-stubs.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': stubs,
      'cloudflare:email': stubs,
    },
  },
  test: {
    // `agents` is ESM with `cloudflare:*` imports; inline it so the aliases apply.
    server: { deps: { inline: ['agents', 'partyserver'] } },
  },
});
