import { describe, expect, it } from 'vitest';
import { LIMITS, planUnits, sendFiles, type SendRequest } from '../src';

const file = (path: string, size = 10) => ({ path, bytes: new Uint8Array(size).fill(0x61) });
const ok = (body: unknown = { files: [] }) => new Response(JSON.stringify(body), { status: 200 });
const noSleep = async () => {};

async function manifestOf(body: FormData | Uint8Array) {
  return JSON.parse(String((body as FormData).get('manifest'))) as { files: Array<{ path: string; held?: true }> };
}

describe('planUnits', () => {
  it('packs small files into batches of at most LIMITS.batchFiles and LIMITS.batchBytes; a bigger file goes alone', () => {
    const many = Array.from({ length: 500 }, (_, i) => file(`f${i}.txt`));
    const units = planUnits(many);
    expect(units).toHaveLength(500 / LIMITS.batchFiles);
    const heavy = [file('a.bin', LIMITS.batchBytes / 2 + 1), file('b.bin', LIMITS.batchBytes / 2 + 1), file('big.bin', LIMITS.batchBytes + 1)];
    expect(planUnits(heavy).map((u) => u.kind).sort()).toEqual(['batch', 'batch', 'put']);
  });
});

describe('sendFiles', () => {
  it('sends a 500-file folder in 10 requests, several at a time, and reports progress per file', async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: string[] = [];
    const request: SendRequest = async (path, init) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      seen.push(path);
      const m = await manifestOf(init.body);
      return ok({ files: m.files.map((f) => ({ path: f.path, mediaType: 'text/plain', view: 'text', findings: [] })) });
    };
    const progress: number[] = [];
    const failed = await sendFiles(request, 'upl_1', Array.from({ length: 500 }, (_, i) => file(`f${i}.txt`)), { concurrency: 4, onProgress: (n) => progress.push(n) });
    expect(failed).toBeNull();
    expect(seen).toHaveLength(10);
    expect(seen.every((p) => p === '/api/v1/uploads/upl_1/batch')).toBe(true);
    expect(peak).toBe(4);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(500);
  });

  it('names held files instead of sending their bytes, and sends any the server says are missing', async () => {
    const calls: Array<{ held: string[]; sent: string[] }> = [];
    const request: SendRequest = async (_path, init) => {
      const m = await manifestOf(init.body);
      calls.push({ held: m.files.filter((f) => f.held).map((f) => f.path), sent: m.files.filter((f) => !f.held).map((f) => f.path) });
      return ok({ files: m.files.map((f) => (f.path === 'gone.txt' && f.held ? { path: f.path, missing: true } : { path: f.path, findings: [] })) });
    };
    const failed = await sendFiles(request, 'upl_1', [file('a.txt'), file('b.txt'), file('gone.txt')], { held: ['a.txt', 'gone.txt'] });
    expect(failed).toBeNull();
    expect(calls).toEqual([{ held: ['a.txt', 'gone.txt'], sent: ['b.txt'] }, { held: [], sent: ['gone.txt'] }]);
  });

  it('retries a request lost in transit or answered 5xx, and stops at the first refusal', async () => {
    let n = 0;
    const flaky: SendRequest = async () => {
      n++;
      if (n === 1) throw new TypeError('fetch failed');
      if (n === 2) return new Response('', { status: 503 });
      return ok();
    };
    expect(await sendFiles(flaky, 'upl_1', [file('a.txt')], { sleep: noSleep })).toBeNull();
    expect(n).toBe(3);

    let calls = 0;
    const refusing: SendRequest = async () => { calls++; return new Response(JSON.stringify({ error: 'sha256_mismatch', path: 'a.txt' }), { status: 400 }); };
    const failed = await sendFiles(refusing, 'upl_1', [file('a.txt')], { sleep: noSleep });
    expect(failed?.status).toBe(400);
    expect(calls).toBe(1);
  });

  it('does not retry the client\'s own errors', async () => {
    const own: SendRequest = async () => { throw new Error('not signed in. Run suli login.'); };
    await expect(sendFiles(own, 'upl_1', [file('a.txt')], { sleep: noSleep })).rejects.toThrow('not signed in');
  });
});
