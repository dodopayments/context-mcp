import { describe, it, expect, vi } from 'vitest';
import { generateEmbeddingsOpenAI, openAISupportsDimensions } from './core.js';

/**
 * Build a minimal fake OpenAI client that records the args passed to
 * `embeddings.create` and returns one vector per input.
 */
function fakeOpenAI() {
  const calls: any[] = [];
  const client = {
    embeddings: {
      create: vi.fn(async (args: any) => {
        calls.push(args);
        // Mirror the real API: it rejects `dimensions` for models that don't
        // support it (e.g. ada-002), which is what we must never trigger.
        if (args.dimensions !== undefined && !args.model.startsWith('text-embedding-3')) {
          const err: any = new Error('This model does not support specifying dimensions.');
          err.status = 400;
          throw err;
        }
        const dim = args.dimensions ?? 1536;
        return { data: args.input.map(() => ({ embedding: new Array(dim).fill(0) })) };
      }),
    },
  };
  return { client: client as any, calls };
}

describe('openAISupportsDimensions', () => {
  it('is true for text-embedding-3 models', () => {
    expect(openAISupportsDimensions('text-embedding-3-small')).toBe(true);
    expect(openAISupportsDimensions('text-embedding-3-large')).toBe(true);
  });

  it('is false for older models that reject the dimensions param', () => {
    expect(openAISupportsDimensions('text-embedding-ada-002')).toBe(false);
  });
});

describe('generateEmbeddingsOpenAI', () => {
  it('forwards dimensions for text-embedding-3 models', async () => {
    const { client, calls } = fakeOpenAI();
    const out = await generateEmbeddingsOpenAI(client, ['a', 'b'], 'text-embedding-3-small', 512);
    expect(calls[0].dimensions).toBe(512);
    expect(calls[0].model).toBe('text-embedding-3-small');
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(512);
  });

  it('omits dimensions for ada-002 even when a value is configured', async () => {
    const { client, calls } = fakeOpenAI();
    // The schema defaults dimensions to 3072, so a number reaches us even when
    // the user never set one — it must NOT be forwarded to ada-002.
    const out = await generateEmbeddingsOpenAI(client, ['a'], 'text-embedding-ada-002', 3072);
    expect('dimensions' in calls[0]).toBe(false);
    expect(out[0]).toHaveLength(1536); // native size
  });

  it('omits dimensions when none is provided', async () => {
    const { client, calls } = fakeOpenAI();
    await generateEmbeddingsOpenAI(client, ['a'], 'text-embedding-3-small');
    expect('dimensions' in calls[0]).toBe(false);
  });
});
