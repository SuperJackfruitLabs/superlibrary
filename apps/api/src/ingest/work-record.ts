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
  // Structured values are redacted through their JSON form, so no field escapes the scan.
  const cleanValue = (field: string, v: unknown): unknown => JSON.parse(clean(field, JSON.stringify(v ?? null)));
  const host = new URL(appUrl).host;
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
    comments: b.comments.map((c) => ({ id: c.id, author: { kind: c.author.kind, name: c.author.name }, body: clean(`comments.${c.id}`, c.body), createdAt: c.createdAt })),
    references: b.references.map((r) => {
      let itemId: string | null = null;
      try {
        const u = new URL(r.url);
        const id = u.host === host ? ITEM_PATH.exec(u.pathname)?.[1] : undefined;
        if (id && ITEM_ID.test(id)) itemId = id;
      } catch { /* not a URL */ }
      return { url: r.url, title: r.title === null ? null : clean('references', r.title), provider: r.provider, itemId };
    }),
    gates: b.gates.map((g) => ({ id: g.id, stage: g.stageKey, decision: g.decision, resolvedAt: g.resolvedAt })),
    supersededByCard: supersededByOf(b),
    outcome: outcomeOf(b),
    redactions: [...new Map(redactions.map((r) => [`${r.field} ${r.rule}`, r])).values()],
    truncated: false,
  };
  // Plan P16, in this order: oldest comments, then oldest handoff bodies, then the spec text.
  let size = bytes(record);
  while (size > BODY_CAP && record.comments.length > 0) {
    size -= bytes(record.comments.shift()) + 1;
    record.truncated = true;
  }
  for (const h of record.handoffs) {
    if (size <= BODY_CAP) break;
    h.handoff = '[left out: the record was too large]';
    record.truncated = true;
    size = bytes(record);
  }
  if (size > BODY_CAP) {
    record.spec = asText(record.spec).slice(0, 100_000);
    record.truncated = true;
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
