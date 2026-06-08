/**
 * Pure CLI + confirmation logic for the clean-vectors script, extracted so the
 * destructive-deletion guard can be unit-tested without a real TTY, Pinecone,
 * or process.exit.
 */

export interface CleanArgs {
  config?: string;
  force: boolean;
  help: boolean;
  /** Unrecognized tokens / flags, surfaced so the script can warn on typos. */
  unknown: string[];
}

/** Parse argv (without the leading `node script` entries). */
export function parseCleanArgs(argv: string[]): CleanArgs {
  const args: CleanArgs = { force: false, help: false, unknown: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--force' || arg === '-f') {
      args.force = true;
    } else if (arg === '--config' || arg === '-c') {
      const value = argv[++i];
      // A dangling --config with no following value is a usage error, not a path.
      if (value === undefined || value.startsWith('-')) {
        args.unknown.push(`${arg} (missing value)`);
        if (value !== undefined) i--; // let the next token be parsed normally
      } else {
        args.config = value;
      }
    } else {
      args.unknown.push(arg);
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

/**
 * True for the AbortError that `node:readline/promises` raises when the user
 * cancels a `rl.question()` with Ctrl+C (SIGINT) or Ctrl+D (EOF).
 *
 * Both cancellations reject the question promise with an `AbortError`
 * (`code === 'ABORT_ERR'`). The clean-vectors script uses this to treat that
 * rejection as a deliberate user abort — print the friendly "Aborted" message
 * and exit 1 — instead of letting it bubble up as an ugly fatal stack trace.
 */
export function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'AbortError' || (err as { code?: unknown }).code === 'ABORT_ERR';
}
