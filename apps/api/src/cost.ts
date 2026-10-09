/**
 * What one request cost in storage calls, answered as `Server-Timing` so a client (and the tests)
 * can see it: D1 statements (D1 caps them per invocation, each statement of a batch counted), D1
 * round trips (each one crosses to the database's region, the dominant cost of a request), and R2
 * operations. Counted by wrapping the bindings; nothing else changes.
 */
import type { Env } from './env';

export interface Cost { d1q: number; d1rt: number; r2: number }

const RAW = Symbol('raw statement');
const RUNS = new Set(['first', 'all', 'run', 'raw']);

function statement(s: D1PreparedStatement, c: Cost): D1PreparedStatement {
  return new Proxy(s, {
    get(target, key) {
      if (key === RAW) return target;
      const v = Reflect.get(target, key, target) as unknown;
      if (typeof v !== 'function') return v;
      if (key === 'bind') return (...args: unknown[]) => statement((v as (...a: unknown[]) => D1PreparedStatement).apply(target, args), c);
      if (typeof key === 'string' && RUNS.has(key)) {
        return (...args: unknown[]) => { c.d1q++; c.d1rt++; return (v as (...a: unknown[]) => unknown).apply(target, args); };
      }
      return (v as (...a: unknown[]) => unknown).bind(target);
    },
  });
}

const unwrap = (s: D1PreparedStatement) => ((s as unknown as Record<symbol, D1PreparedStatement>)[RAW] ?? s);

function database(db: D1Database, c: Cost): D1Database {
  return new Proxy(db, {
    get(target, key) {
      if (key === 'prepare') return (query: string) => statement(target.prepare(query), c);
      if (key === 'batch') return (list: D1PreparedStatement[]) => { c.d1q += list.length; c.d1rt++; return target.batch(list.map(unwrap)); };
      if (key === 'exec') return (query: string) => { c.d1q++; c.d1rt++; return target.exec(query); };
      const v = Reflect.get(target, key, target) as unknown;
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
}

function bucket(r2: R2Bucket, c: Cost): R2Bucket {
  return new Proxy(r2, {
    get(target, key) {
      const v = Reflect.get(target, key, target) as unknown;
      if (typeof v !== 'function') return v;
      return (...args: unknown[]) => { c.r2++; return (v as (...a: unknown[]) => unknown).apply(target, args); };
    },
  });
}

export function counted(env: Env): { env: Env; cost: Cost } {
  const cost: Cost = { d1q: 0, d1rt: 0, r2: 0 };
  return { env: { ...env, DB: database(env.DB, cost), BLOBS: bucket(env.BLOBS, cost) }, cost };
}

export function withCost(res: Response, cost: Cost, startedAt: number): Response {
  const value = `d1q;desc="${cost.d1q}", d1rt;desc="${cost.d1rt}", r2;desc="${cost.r2}", app;dur=${Date.now() - startedAt}`;
  try {
    res.headers.set('Server-Timing', value);
    return res;
  } catch {
    // An immutable response (one passed through from elsewhere): copy it to add the header.
    const copy = new Response(res.body, res);
    copy.headers.set('Server-Timing', value);
    return copy;
  }
}
