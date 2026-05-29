/**
 * Pure CLI + confirmation logic for the clean-vectors script, extracted so the
 * destructive-deletion guard can be unit-tested without a real TTY, Pinecone,
 * or process.exit.
 */

export interface CleanArgs {
  config?: string;
  force: boolean;
  help: boolean;
}

/** Parse argv (without the leading `node script` entries). */
export function parseCleanArgs(argv: string[]): CleanArgs {
  const args: CleanArgs = { force: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--force' || arg === '-f') {
      args.force = true;
    } else if (arg === '--config' || arg === '-c') {
      args.config = argv[++i];
    }
  }
  return args;
}

export interface DeletionDecision {
  /** Whether deletion should proceed. */
  proceed: boolean;
  /** Why — used for messaging / branching in the script. */
  reason: 'forced' | 'confirmed' | 'mismatch' | 'non-interactive';
}

export interface DeletionContext {
  force: boolean;
  isTTY: boolean;
  indexName: string;
  /** The user's typed answer; undefined if not prompted (e.g. non-interactive). */
  answer?: string;
}

/**
 * Decide whether a destructive clean should proceed.
 *
 * Rules:
 * - `--force` always proceeds (CI / non-interactive use).
 * - Without --force and without a TTY, refuse (never delete silently).
 * - With a TTY, proceed only if the typed answer exactly matches the index name
 *   (after trimming whitespace).
 */
export function resolveDeletion(ctx: DeletionContext): DeletionDecision {
  if (ctx.force) return { proceed: true, reason: 'forced' };
  if (!ctx.isTTY) return { proceed: false, reason: 'non-interactive' };
  if ((ctx.answer ?? '').trim() === ctx.indexName) {
    return { proceed: true, reason: 'confirmed' };
  }
  return { proceed: false, reason: 'mismatch' };
}
