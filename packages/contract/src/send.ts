/**
 * Sending an upload's files, the same way from every client (suli and the web app): small files
 * travel together in batches (POST /uploads/:id/batch), a file over LIMITS.batchBytes alone (PUT),
 * several requests at a time. Files the server says this person already sent (`held` from the
 * create answer) are named, not sent. A request that fails in transit, or that the server answers
 * 429 or 5xx, is sent again: every one of them is idempotent.
 */
import { LIMITS } from './limits';
import { checkPath } from './paths';

export interface SendableFile { path: string; bytes: Uint8Array }
/** One request through the client's own transport, which adds the person's token. */
export type SendRequest = (path: string, init: { method: 'PUT' | 'POST'; body: FormData | Uint8Array }) => Promise<Response>;

export interface SendOptions {
  /** Requests in flight at once. */
  concurrency?: number;
  /** Paths (as the server normalised them) whose bytes the server already holds for this person. */
  held?: Iterable<string>;
  /** Files accounted for so far, of the total: called before the first request and after each. */
  onProgress?: (sent: number, total: number) => void;
  /** Further attempts after a transient failure. */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export const SEND_CONCURRENCY = 6;

type Unit = { kind: 'put'; file: SendableFile } | { kind: 'batch'; files: SendableFile[]; held: Set<string> };

const normalised = (path: string) => { const c = checkPath(path); return c.ok ? c.path : path; };

/** Batches of at most LIMITS.batchFiles files and LIMITS.batchBytes bytes; bigger files alone. */
export function planUnits(files: SendableFile[], held: Set<string> = new Set()): Unit[] {
  const units: Unit[] = [];
  let current: SendableFile[] = [];
  let currentHeld = new Set<string>();
  let bytes = 0;
  const flush = () => {
    if (current.length > 0) units.push({ kind: 'batch', files: current, held: currentHeld });
    current = []; currentHeld = new Set(); bytes = 0;
  };
  for (const f of files) {
    const isHeld = held.has(normalised(f.path));
    if (!isHeld && f.bytes.length > LIMITS.batchBytes) { units.push({ kind: 'put', file: f }); continue; }
    const size = isHeld ? 0 : f.bytes.length;
    if (current.length >= LIMITS.batchFiles || bytes + size > LIMITS.batchBytes) flush();
    current.push(f);
    if (isHeld) currentHeld.add(f.path);
    bytes += size;
  }
  flush();
  return units;
}

function batchBody(files: SendableFile[], held: Set<string>): FormData {
  const form = new FormData();
  form.append('manifest', JSON.stringify({ files: files.map((f) => (held.has(f.path) ? { path: f.path, held: true } : { path: f.path })) }));
  for (const f of files) if (!held.has(f.path)) form.append('file', new Blob([f.bytes as Uint8Array<ArrayBuffer>]), 'file');
  return form;
}

/** A failure in transit (no answer), not one of the client's own refusals. */
export function isTransient(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const x = e as { code?: unknown; name?: unknown } | null;
  return typeof x?.code === 'string' || x?.name === 'AbortError' || x?.name === 'TimeoutError';
}
const retryable = (status: number) => status === 429 || status >= 500;

async function attempt(req: () => Promise<Response>, retries: number, sleep: (ms: number) => Promise<void>): Promise<Response> {
  for (let n = 0; ; n++) {
    try {
      const res = await req();
      if (!retryable(res.status) || n >= retries) return res;
    } catch (e) {
      if (!isTransient(e) || n >= retries) throw e;
    }
    await sleep(500 * 2 ** n);
  }
}

/** null when every file arrived; else the first refusal, as the server answered it. */
export async function sendFiles(request: SendRequest, uploadId: string, files: SendableFile[], o: SendOptions = {}): Promise<Response | null> {
  const retries = o.retries ?? 3;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const total = files.length;
  let sent = 0;
  o.onProgress?.(0, total);
  let failed: Response | null = null;
  let units = planUnits(files, new Set(o.held ?? []));
  for (let round = 0; round < 2 && units.length > 0 && !failed; round++) {
    const missing: SendableFile[] = [];
    let next = 0;
    const worker = async () => {
      while (!failed && next < units.length) {
        const u = units[next++]!;
        const res = u.kind === 'put'
          ? await attempt(() => request(`/api/v1/uploads/${uploadId}/files?path=${encodeURIComponent(u.file.path)}`, { method: 'PUT', body: u.file.bytes }), retries, sleep)
          : await attempt(() => request(`/api/v1/uploads/${uploadId}/batch`, { method: 'POST', body: batchBody(u.files, u.held) }), retries, sleep);
        if (!res.ok) { failed ??= res; return; }
        let done = u.kind === 'put' ? 1 : u.files.length;
        if (u.kind === 'batch') {
          // A held file the server no longer has (or will not count as this person's) is sent with its bytes.
          const answer = (await res.json()) as { files: Array<{ path: string; missing?: boolean }> };
          const gone = new Set(answer.files.filter((f) => f.missing).map((f) => f.path));
          for (const f of u.files) if (gone.has(normalised(f.path))) { missing.push(f); done--; }
        } else {
          await res.body?.cancel();
        }
        sent += done;
        o.onProgress?.(sent, total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(o.concurrency ?? SEND_CONCURRENCY, units.length) }, worker));
    units = planUnits(missing);
  }
  return failed;
}
