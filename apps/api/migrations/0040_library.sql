-- Phase 4: the library app. Numbers 0040-0049 are phase 4's (Stage 3 owns 0030-0039).

-- Spec §7, §11: an artifact's caption, set by a person, indexed with its title.
ALTER TABLE items ADD COLUMN caption TEXT;
-- Spec §11: "mark an item superseded by another". The person's choice, kept beside the outcome it
-- replaced so it can be undone; the card's own `supersedes` link stays in work_records.
ALTER TABLE items ADD COLUMN superseded_by TEXT;
ALTER TABLE items ADD COLUMN superseded_prior TEXT;

-- Spec §3 Collection: a named set of items people curate. Membership also writes an
-- item_references row (from_kind 'collection'), which is what keeps an artifact past 30 days (§12).
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX collections_name ON collections(workspace_id, name COLLATE NOCASE);

CREATE TABLE collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  note TEXT,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (collection_id, item_id)
);
CREATE INDEX collection_items_item ON collection_items(item_id);

-- Spec §11 "remove an item from memory": a work record removed by a person stays removed; the
-- card's later events must not bring it back (decision O5). The reason is also in the audit log.
CREATE TABLE removed_cards (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  card_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  removed_by TEXT NOT NULL,
  removed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (workspace_id, card_id)
);

-- The filters (spec §11): only the agent is indexed (item_sources.agent_principal); the station filter
-- reads station and station_name unindexed. Outcome views use items(workspace_id, outcome).
CREATE INDEX item_sources_agent ON item_sources(agent_principal);
CREATE INDEX items_workspace_outcome ON items(workspace_id, outcome);
