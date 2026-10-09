-- apps/api/migrations/0004_foundation.sql
-- Phases 2-3 (plan Stage 0). Every table both lanes need, in one migration, so the lanes never
-- race for migration numbers.

-- Task A10: a station link's provenance rides on its upload session until commit.
ALTER TABLE upload_sessions ADD COLUMN source TEXT;

-- Spec §3 provenance. One row per item that has more than a person's upload to say.
CREATE TABLE item_sources (
  item_id TEXT PRIMARY KEY REFERENCES items(id),
  source TEXT NOT NULL CHECK (source IN ('upload', 'agentpod', 'superpipeline')),
  board_id TEXT,
  card_id TEXT,
  stage TEXT,
  run_id TEXT,
  agent_principal TEXT,
  -- The service principal that acted for the agent (the AgentPod hub acts with its own service
  -- token); provenance records both the hub and the agent.
  via_service TEXT,
  station TEXT,
  source_path TEXT,
  source_id TEXT,
  source_url TEXT,
  -- Spec §12: removing a station keeps its artifacts, marked as from a removed station.
  station_removed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- An agentpod item must name both the agent and the hub that acted for it.
  CHECK (source <> 'agentpod' OR (agent_principal IS NOT NULL AND via_service IS NOT NULL))
);
-- Spec §3: an artifact is versioned by source path; this finds the item to add version n+1 to.
CREATE INDEX item_sources_station_path ON item_sources(station, source_path);
CREATE INDEX item_sources_card ON item_sources(card_id);

-- Spec §3 work record; body is the WorkRecord JSON (plan P16), text is what indexing reads.
CREATE TABLE work_records (
  item_id TEXT PRIMARY KEY REFERENCES items(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  board_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  -- SHA-256 of the body: an unchanged card re-synced writes nothing (plan P5).
  digest TEXT NOT NULL,
  body TEXT NOT NULL,
  text TEXT NOT NULL,
  redacted INTEGER NOT NULL DEFAULT 0 CHECK (redacted IN (0, 1)),
  superseded_by_card TEXT,
  source_updated_at TEXT,
  synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX work_records_card ON work_records(workspace_id, card_id);

-- Boards Superlibrary has subscribed to (Task A11). Also the people-visibility list (plan P4).
CREATE TABLE source_boards (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  board_id TEXT NOT NULL,
  name TEXT NOT NULL,
  push_config_id TEXT,
  subscribed_at TEXT,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, board_id)
);

-- Spec §4: an agent's boards from the AgentPod hub, cached five minutes (Task B4).
CREATE TABLE roster_cache (
  principal_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  boards TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

-- Spec §7 chunks. No foreign key: the index consumer deletes these after the item is gone.
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX chunks_item ON chunks(item_id, version, position);
CREATE VIRTUAL TABLE chunks_fts USING fts5(text, chunk_id UNINDEXED, item_id UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');

-- What is indexed for each item, so a duplicate message changes nothing and a deletion knows
-- which vectors to remove. slots: JSON {"a":"workers-ai/bge-m3"} — where its vectors are.
CREATE TABLE index_state (
  item_id TEXT PRIMARY KEY,
  digest TEXT NOT NULL,
  chunk_ids TEXT NOT NULL,
  slots TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);

-- Plan P9: two Vectorize indexes, one active. A slot holds vectors from exactly one embedder.
CREATE TABLE vector_slots (
  slot TEXT PRIMARY KEY CHECK (slot IN ('a', 'b')),
  embedder_id TEXT,
  dims INTEGER,
  state TEXT NOT NULL CHECK (state IN ('active', 'building', 'idle')),
  cursor TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO vector_slots (slot, embedder_id, dims, state) VALUES ('a', 'workers-ai/bge-m3', 1024, 'active'), ('b', NULL, NULL, 'idle');
CREATE TRIGGER vector_slots_one_active BEFORE UPDATE OF state ON vector_slots
  WHEN NEW.state = 'active' AND EXISTS (SELECT 1 FROM vector_slots WHERE state = 'active' AND slot <> NEW.slot)
BEGIN
  SELECT RAISE(ABORT, 'one active slot');
END;
