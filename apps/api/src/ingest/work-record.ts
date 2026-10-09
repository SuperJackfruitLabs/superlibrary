import { ITEM_ID, WORK_RECORD_SCHEMA, type Outcome, type WorkRecord } from '@superlibrary/contract';
import { redactSecrets } from '../guard/secrets';
import type { CardBundle } from '../sources/superpipeline';

/** Plan P16: a stored record is capped at 900 KB, measured in UTF-8 bytes. */
export const BODY_CAP = 900_000;
const ITEM_PATH = /^\/a\/(itm_[0-9a-f]{16})(?:\/v\/[1-9][0-9]*)?$/;
const enc = new TextEncoder();
const bytes = (v: unknown) => enc.encode(JSON.stringify(v)).length;

/** Plan P6, first match wins. */
export function outcomeOf(b: CardBundle): Outcome {
  if (supersededByOf(b)) return 'superseded';
  const s = b.card.state;
  if (s === 'rejected') return 'rejected';
  if (s === 'completed') return b.gates.some((g) => g.decision === 'approve') ? 'approved' : 'completed';
  if (s === 'failed' || b.card.needsHuman?.reason === 'repeated-failure') return 'failed';
  if (s === 'canceled' || b.card.archivedAt) return 'abandoned';
  return 'in-progress';
}

export function supersededByOf(b: CardBundle): string | null {
  const l = b.links.filter((x) => x.kind === 'supersedes' && x.toCardId === b.card.id && x.fromCardId !== b.card.id);
  return l.at(-1)?.fromCardId ?? null;
}

/** Spec §5 "structured spec fields flattened to text". */
export function flattenSpec(spec: unknown, prefix = ''): string {
  if (spec === null || spec === undefined) return '';
  if (typeof spec !== 'object') return prefix ? `${prefix}: ${String(spec)}` : String(spec);
  if (Array.isArray(spec)) {
    const simple = spec.every((x) => x === null || typeof x !== 'object');
    if (simple) return prefix ? `${prefix}: ${spec.join('; ')}` : spec.join('; ');
    return spec.map((x, i) => flattenSpec(x, `${prefix}[${i}]`)).filter(Boolean).join('\n');
  }
  return Object.entries(spec as Record<string, unknown>).map(([k, v]) => flattenSpec(v, prefix ? `${prefix}.${k}` : k)).filter(Boolean).join('\n');
}

const asText = (v: unknown) => (typeof v === 'string' ? v : flattenSpec(v));

export function buildWorkRecord(b: CardBundle, appUrl: string): { record: WorkRecord; text: string } {
  const redactions: WorkRecord['redactions'] = [];
  const clean = (field: string, s: string) => {
    const r = redactSecrets(s);
    for (const rule of r.rules) redactions.push({ field, rule });
    return r.text;
  };
  // Structured values are walked and every string leaf and key is redacted as text: scanning the
  // JSON form would see newlines as `\\n` and quotes as `\\"`, and miss line-anchored matches.
  const cleanValue = (field: string, v: unknown): unknown => {
    if (typeof v === 'string') return clean(field, v);
    if (Array.isArray(v)) return v.map((x) => cleanValue(field, x));
    if (v !== null && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) o[clean(field, k)] = cleanValue(field, x);
      return o;
    }
    return v ?? null;
  };
  let host = '';
  try { host = new URL(appUrl).host; } catch { /* no app url: no item links */ }
  const attempts = [...b.attempts].sort((x, y) => (x.startedAt ?? '').localeCompare(y.startedAt ?? ''));
  const record: WorkRecord = {
    schema: WORK_RECORD_SCHEMA,
    boardId: '',
    cardId: b.card.id,
    title: clean('title', b.card.title),
    spec: cleanValue('spec', b.card.spec),
    state: b.card.state,
    stage: b.card.currentStageKey,
    archivedAt: b.card.archivedAt,
    createdAt: b.card.createdAt,
    updatedAt: b.card.updatedAt,
    handoffs: attempts.map((a, i) => ({
      runId: a.runId, stage: a.stageKey, agent: a.agentId, startedAt: a.startedAt, endedAt: a.endedAt, attempt: i + 1,
      status: a.status, handoff: cleanValue(`handoffs.${a.runId}`, a.handoff),
      failureReason: a.failureReason === null ? null : clean(`handoffs.${a.runId}`, a.failureReason),
    })),
    comments: [...b.comments].filter((c) => !c.deletedAt).sort((x, y) => x.createdAt.localeCompare(y.createdAt)).map((c) => ({ id: c.id, author: { kind: c.author.kind, name: c.author.name }, body: clean(`comments.${c.id}`, c.body), createdAt: c.createdAt })),
    references: b.references.map((r) => {
      let itemId: string | null = null;
      try {
        const u = new URL(r.url);
        const id = host && u.host === host ? ITEM_PATH.exec(u.pathname)?.[1] : undefined;
        if (id && ITEM_ID.test(id)) itemId = id;
      } catch { /* not a URL */ }
      return { url: clean('references', r.url), title: r.title === null ? null : clean('references', r.title), provider: r.provider, itemId };
    }),
    gates: b.gates.map((g) => ({ id: g.id, stage: g.stageKey, decision: g.decision, resolvedAt: g.resolvedAt })),
    supersededByCard: supersededByOf(b),
    outcome: outcomeOf(b),
    redactions: [...new Map(redactions.map((r) => [`${r.field} ${r.rule}`, r])).values()],
    truncated: false,
  };
  // Plan P16, in this order: oldest comments, then oldest handoff bodies, then the spec text, then
  // the other free-text fields. The last step always ends under the cap.
  let size = bytes(record);
  for (;;) {
    while (size > BODY_CAP && record.comments.length > 0) {
      size -= bytes(record.comments.shift()) + 1;
      record.truncated = true;
    }
    size = bytes(record);
    if (size <= BODY_CAP || record.comments.length === 0) break;
  }
  for (const h of record.handoffs) {
    if (size <= BODY_CAP) break;
    h.handoff = '[left out: the record was too large]';
    record.truncated = true;
    size = bytes(record);
  }
  if (size > BODY_CAP) {
    record.truncated = true;
    const full = asText(record.spec);
    let n = Math.min(full.length, 100_000);
    record.spec = full.slice(0, n);
    while (bytes(record) > BODY_CAP && n > 0) { n = Math.floor(n / 2); record.spec = full.slice(0, n); }
    if (bytes(record) > BODY_CAP) {
      const clip = (s: string | null) => (s === null ? null : s.slice(0, 1000));
      record.title = record.title.slice(0, 1000);
      for (const h of record.handoffs) h.failureReason = clip(h.failureReason);
      for (const r of record.references) { r.title = clip(r.title); r.url = r.url.slice(0, 1000); }
      while (bytes(record) > BODY_CAP && record.references.length > 0) record.references.pop();
      while (bytes(record) > BODY_CAP && record.handoffs.length > 0) record.handoffs.pop();
      while (bytes(record) > BODY_CAP && record.gates.length > 0) record.gates.pop();
    }
  }
  const text = [
    record.title,
    flattenSpec(record.spec),
    ...record.handoffs.map((h) => `Handoff, ${h.stage}, attempt ${h.attempt}:\n${asText(h.handoff)}${h.failureReason ? `\nFailed: ${h.failureReason}` : ''}`),
    ...record.comments.map((c) => `Comment by ${c.author.name ?? c.author.kind}:\n${c.body}`),
    ...record.references.map((r) => `Reference: ${r.title ?? r.url}`),
  ].filter((s) => s.trim() !== '').join('\n\n');
  return { record, text };
}
