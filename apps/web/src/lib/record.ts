// apps/web/src/lib/record.ts
import type { WorkRecord } from '@superlibrary/contract';

export type Tone = 'good' | 'bad' | 'neutral';
export interface TimelineEntry { key: string; kind: 'created' | 'attempt' | 'comment' | 'gate' | 'archived'; at: string | null; title: string; who: string | null; detail: string | null; tone: Tone }

const GATE_WORDS = { approve: 'approved', request_changes: 'sent back for changes', reject: 'rejected' } as const;
const toneOf = (status: string): Tone =>
  /^(completed|produced|succeeded|done)$/.test(status) ? 'good' : /^(failed|error|rejected|canceled|cancelled|timed_out)$/.test(status) ? 'bad' : 'neutral';

/** A handoff as text: a string, an object's summary or text, else its JSON (capped at 2,000). Never markup. */
export function handoffText(h: unknown): string | null {
  if (h === null || h === undefined) return null;
  if (typeof h === 'string') return h.trim() || null;
  if (typeof h === 'object' && !Array.isArray(h)) {
    const o = h as Record<string, unknown>;
    for (const k of ['summary', 'text', 'message']) if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim();
  }
  const s = JSON.stringify(h, null, 2);
  return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
}

/** Spec §11: stages, agents, handoffs, comments and gates, in the order they happened. */
export function timelineOf(r: WorkRecord): TimelineEntry[] {
  const out: TimelineEntry[] = [{ key: 'created', kind: 'created', at: r.createdAt, title: 'Card created', who: null, detail: null, tone: 'neutral' }];
  for (const h of r.handoffs) {
    out.push({ key: `run:${h.runId}`, kind: 'attempt', at: h.startedAt ?? h.endedAt, title: `${h.stage} · attempt ${h.attempt} · ${h.status}`, who: h.agent,
      detail: h.failureReason ? `Failed: ${h.failureReason}` : handoffText(h.handoff), tone: toneOf(h.status) });
  }
  for (const c of r.comments) {
    out.push({ key: `comment:${c.id}`, kind: 'comment', at: c.createdAt, title: 'Comment', who: c.author.name ?? (c.author.kind === 'agent' ? 'An agent' : 'A person'), detail: c.body, tone: 'neutral' });
  }
  for (const g of r.gates) {
    out.push({ key: `gate:${g.id}`, kind: 'gate', at: g.resolvedAt, title: g.decision ? `Gate at ${g.stage}: ${GATE_WORDS[g.decision]}` : `Gate at ${g.stage}: waiting`,
      who: null, detail: null, tone: g.decision === 'approve' ? 'good' : g.decision ? 'bad' : 'neutral' });
  }
  if (r.archivedAt) out.push({ key: 'archived', kind: 'archived', at: r.archivedAt, title: 'Archived', who: null, detail: null, tone: 'neutral' });
  return out
    .map((e, i) => ({ e, i }))
    .sort((a, b) => Number(a.e.at === null) - Number(b.e.at === null) || (a.e.at && b.e.at ? Date.parse(a.e.at) - Date.parse(b.e.at) : 0) || a.i - b.i)
    .map((x) => x.e);
}

export const toneVar = (t: Tone) => (t === 'good' ? 'var(--sl-outcome-approved)' : t === 'bad' ? 'var(--sl-outcome-rejected)' : 'var(--vk-color-faint)');

export function specRows(spec: unknown): Array<{ label: string; value: string }> {
  if (spec === null || spec === undefined) return [];
  if (typeof spec !== 'object' || Array.isArray(spec)) return [{ label: 'Spec', value: handoffText(spec) ?? '' }];
  return Object.entries(spec as Record<string, unknown>).map(([label, v]) => ({ label, value: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }));
}
