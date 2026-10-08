-- A committed upload session is final: its state and its result (item, version) never change
-- again. Two commits of the same session racing each other both pass the `state = 'open'` read;
-- the loser's batch starts with the session update, hits this trigger, and writes nothing, so one
-- session can never make two items or two versions.
CREATE TRIGGER upload_sessions_committed_final BEFORE UPDATE ON upload_sessions
  WHEN OLD.state = 'committed'
BEGIN
  SELECT RAISE(ABORT, 'upload already committed');
END;
