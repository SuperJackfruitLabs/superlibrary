-- Gap S1: a person's "Link this file" in the AgentPod console records its station and path. The
-- agentpod CHECK (Stage 0 ruling R3) names an agent and the hub that acted for it. A person's link
-- names neither, and names the person instead (linked_by). SQLite cannot alter a CHECK, so the
-- table is rebuilt: D1 applies this file as one transaction, every row is copied, every index of
-- the old table is recreated (ruling P4-R16).
PRAGMA defer_foreign_keys = true;

CREATE TABLE item_sources_new (
  item_id TEXT PRIMARY KEY REFERENCES items(id),
  source TEXT NOT NULL CHECK (source IN ('upload', 'agentpod', 'superpipeline')),
  board_id TEXT,
  card_id TEXT,
  stage TEXT,
  run_id TEXT,
  agent_principal TEXT,
  -- The service principal that acted for the agent (the AgentPod hub acts with its own service
  -- token). Provenance records both the hub and the agent.
  via_service TEXT,
  station TEXT,
  -- The station's readable key as the hub named it.
  station_name TEXT,
  source_path TEXT,
  source_id TEXT,
  source_url TEXT,
  -- Spec §12: removing a station keeps its artifacts, marked as from a removed station.
  station_removed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- The person who linked it from their own station (gap S1). The hub confirmed the station is theirs.
  linked_by TEXT,
  -- An agentpod item names either the agent and the hub that acted for it (each a prn), or the
  -- person alone with the station and the path. Never both, never neither (a NULL passes a CHECK,
  -- so each is refused explicitly).
  CHECK (source <> 'agentpod' OR (
    (agent_principal IS NOT NULL AND agent_principal GLOB 'prn_[0-9a-f]*' AND length(agent_principal) = 24
      AND via_service IS NOT NULL AND via_service GLOB 'prn_[0-9a-f]*' AND length(via_service) = 24
      AND linked_by IS NULL)
    OR
    (agent_principal IS NULL AND via_service IS NULL
      AND linked_by IS NOT NULL AND linked_by GLOB 'prn_[0-9a-f]*' AND length(linked_by) = 24
      AND station IS NOT NULL AND source_path IS NOT NULL)
  ))
);
INSERT INTO item_sources_new (item_id, source, board_id, card_id, stage, run_id, agent_principal, via_service, station, station_name, source_path, source_id, source_url, station_removed_at, created_at)
  SELECT item_id, source, board_id, card_id, stage, run_id, agent_principal, via_service, station, station_name, source_path, source_id, source_url, station_removed_at, created_at FROM item_sources;
DROP TABLE item_sources;
ALTER TABLE item_sources_new RENAME TO item_sources;
-- Every index the old table had: 0004's two and 0040's agent filter (Task 2).
CREATE INDEX item_sources_station_path ON item_sources(station, source_path);
CREATE INDEX item_sources_card ON item_sources(card_id);
CREATE INDEX item_sources_agent ON item_sources(agent_principal);

-- The confirmed station file rides on its upload session until commit, like a hub link's source.
ALTER TABLE upload_sessions ADD COLUMN station_file TEXT;
