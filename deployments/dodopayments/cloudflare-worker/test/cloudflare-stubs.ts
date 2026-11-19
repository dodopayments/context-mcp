// Minimal stand-ins for `cloudflare:*` modules so the `agents` package can be
// imported under plain Node in vitest. Nothing here is exercised by the tests.
export class DurableObject {}
export class WorkerEntrypoint {}
export class EmailMessage {}
export const env = {};
