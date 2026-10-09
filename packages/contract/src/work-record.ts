import type { Outcome } from './model';

export const WORK_RECORD_SCHEMA = 'work-record/1' as const;

/** One attempt at one stage, with what it handed on (spec §3: agent, stage, time and attempt). */
export interface WorkRecordHandoff {
  runId: string;
  stage: string;
  agent: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** 1-based, in run order: Superpipeline has no explicit attempt field. */
  attempt: number;
  status: string;
  handoff: unknown;
  failureReason: string | null;
}
export interface WorkRecordComment {
  id: string;
  author: { kind: 'human' | 'agent'; name: string | null };
  body: string;
  createdAt: string;
}
export interface WorkRecordReference {
  url: string;
  title: string | null;
  provider: string;
  /** Set when the URL is a Superlibrary item link (`/a/itm_…`). */
  itemId: string | null;
}
export interface WorkRecordGate {
  id: string;
  stage: string;
  decision: 'approve' | 'request_changes' | 'reject' | null;
  resolvedAt: string | null;
}

/** The whole card, start to finish (spec §3, Work record). Stored in D1 (plan P16). */
export interface WorkRecord {
  schema: typeof WORK_RECORD_SCHEMA;
  boardId: string;
  cardId: string;
  title: string;
  spec: unknown;
  state: string;
  stage: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  handoffs: WorkRecordHandoff[];
  comments: WorkRecordComment[];
  references: WorkRecordReference[];
  gates: WorkRecordGate[];
  /** The card that supersedes this one (same board, plan P7). */
  supersededByCard: string | null;
  outcome: Outcome;
  /** Rules that fired and where; never the matched text (spec §8). */
  redactions: Array<{ field: string; rule: string }>;
  /** Plan P16: older comments or handoff bodies were dropped to stay under the cap. */
  truncated: boolean;
}
