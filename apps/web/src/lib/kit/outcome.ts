// apps/web/src/lib/kit/outcome.ts
import type { Outcome } from '@superlibrary/contract';

/** Spec §3: how the work turned out, in words. Shown on every result, always with its colour. */
export const OUTCOME_WORDS: Record<Outcome, string> = {
  approved: 'Approved', completed: 'Completed', 'in-progress': 'In progress', superseded: 'Superseded',
  rejected: 'Rejected', failed: 'Failed', abandoned: 'Abandoned',
};
/** In ranking order (spec §7): what ranks first, first. */
export const OUTCOME_ORDER: Outcome[] = ['approved', 'completed', 'in-progress', 'superseded', 'rejected', 'failed', 'abandoned'];
export const outcomeVar = (o: Outcome) => `var(--sl-outcome-${o})`;
