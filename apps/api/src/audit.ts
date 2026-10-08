import { newId } from './ids';

export interface AuditEvent {
  workspaceId: string | null;
  /** The principal who acted, or `retention` for the sweep. */
  actor: string;
  /** `act.sub` when a service acted for the principal (recorded, never authority). */
  act?: string | null;
  action: string;
  itemId?: string | null;
  version?: number | null;
  detail?: Record<string, unknown>;
}

/** A statement, not a write: batch it with the change it records so neither lands alone. */
export function audit(db: D1Database, e: AuditEvent): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO audit_events (id, workspace_id, actor, act, action, item_id, version, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(newId('aud'), e.workspaceId, e.actor, e.act ?? null, e.action, e.itemId ?? null, e.version ?? null, JSON.stringify(e.detail ?? {}));
}
