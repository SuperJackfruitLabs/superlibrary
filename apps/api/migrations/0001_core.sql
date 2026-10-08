-- Superlibrary's catalog (spec §3, §8, §12). Workspaces are the organization plane's orgs, mapped
-- as Superpipeline maps its tenants: external_source = 'org-plane', external_id = org_ (issuer
-- contract §2), one row per org (Superpipeline migration 0017).
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  external_source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  quota_bytes INTEGER NOT NULL DEFAULT 1073741824,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX workspaces_external_unique ON workspaces(external_source, external_id);

-- The plane's token carries no role. First person seen is owner (Superpipeline provisionOrgHuman).
CREATE TABLE members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, principal_id)
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind TEXT NOT NULL CHECK (kind IN ('artifact', 'work-record')),
  title TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope = 'workspace' OR (scope GLOB 'board:brd_*' AND length(scope) = 26)),
  outcome TEXT NOT NULL DEFAULT 'completed'
    CHECK (outcome IN ('approved', 'completed', 'rejected', 'failed', 'abandoned', 'superseded', 'in-progress')),
  created_by TEXT NOT NULL,
  latest_version INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  revoked_at TEXT,
  revoked_by TEXT,
  revoke_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX items_workspace_created ON items(workspace_id, created_at);

CREATE TABLE versions (
  item_id TEXT NOT NULL REFERENCES items(id),
  version INTEGER NOT NULL,
  entry TEXT NOT NULL,
  view TEXT NOT NULL,
  media_type TEXT NOT NULL,
  total_bytes INTEGER NOT NULL,
  file_count INTEGER NOT NULL,
  -- The file's SHA-256 for one file; for a folder, the SHA-256 of its sorted (path, sha256) list.
  sha256 TEXT NOT NULL,
  created_by TEXT NOT NULL,
  scan_override INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  revoked_by TEXT,
  PRIMARY KEY (item_id, version)
);
-- Spec §3: a version is an immutable snapshot. Only revocation may change a row.
CREATE TRIGGER versions_immutable
  BEFORE UPDATE OF item_id, version, entry, view, media_type, total_bytes, file_count, sha256, created_by, scan_override, created_at ON versions
BEGIN
  SELECT RAISE(ABORT, 'versions are immutable');
END;

CREATE TABLE version_files (
  item_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  view TEXT NOT NULL,
  PRIMARY KEY (item_id, version, path),
  FOREIGN KEY (item_id, version) REFERENCES versions(item_id, version)
);
CREATE INDEX version_files_sha ON version_files(sha256);
CREATE TRIGGER version_files_immutable BEFORE UPDATE ON version_files
BEGIN
  SELECT RAISE(ABORT, 'versions are immutable');
END;

-- Plan decision D16: an upload declares its files, sends them one by one, then commits.
CREATE TABLE upload_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_by TEXT NOT NULL,
  item_id TEXT,
  title TEXT NOT NULL,
  scope TEXT NOT NULL,
  entry TEXT NOT NULL,
  item_expires_at TEXT,
  expires_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'committed')),
  result_item_id TEXT,
  result_version INTEGER,
  override_reason TEXT,
  override_by TEXT,
  override_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE upload_files (
  session_id TEXT NOT NULL REFERENCES upload_sessions(id),
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  received INTEGER NOT NULL DEFAULT 0,
  media_type TEXT,
  view TEXT,
  PRIMARY KEY (session_id, path)
);
CREATE INDEX upload_files_sha ON upload_files(sha256);
CREATE TABLE secret_findings (
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  line INTEGER NOT NULL,
  rule TEXT NOT NULL,
  PRIMARY KEY (session_id, path, line, rule)
);

-- Spec §12: an artifact referenced by a work record, a card or a collection is kept. Phase 2 and
-- phase 4 write these rows; phase 1 only reads them.
CREATE TABLE item_references (
  item_id TEXT NOT NULL REFERENCES items(id),
  from_kind TEXT NOT NULL CHECK (from_kind IN ('work-record', 'card', 'collection')),
  from_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_id, from_kind, from_id)
);

-- Spec §8: every read is written to the audit log. Append-only, as in Accounts' 0001.
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  actor TEXT NOT NULL,
  act TEXT,
  action TEXT NOT NULL,
  item_id TEXT,
  version INTEGER,
  detail TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX audit_events_item ON audit_events(item_id, at);
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'the audit log is append-only');
END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'the audit log is append-only');
END;
