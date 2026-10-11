import type { ItemSource, Outcome } from '@superlibrary/contract';
import type { Mood } from '@superjackfruit/vibekit';

/** An agent that made something. The face is vibekit's default from the id (the API has no avatar URL; spec D8). */
export interface Maker { id: string; label: string }

export function makerOf(source?: ItemSource, createdBy?: string): Maker | null {
  if (!source?.agent) return null;
  const id = source.agentPrincipal ?? createdBy;
  return id ? { id, label: `An agent (${id})` } : null;
}

export const moodOf = (o: Outcome): Mood => (o === 'approved' || o === 'completed' ? 'done' : o === 'in-progress' ? 'working' : 'resting');
