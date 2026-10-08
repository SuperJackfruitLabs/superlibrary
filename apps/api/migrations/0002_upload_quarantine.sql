-- Spec §8 "secret scan before storing", controller ruling T7/T8: a received file whose scan hit is
-- held at R2 `quarantine/<session_id>/<sha256>`, never under `blobs/`, so it can never be served.
-- Commit moves it into `blobs/` only after a recorded override; a session that never commits has
-- its quarantine deleted by the retention sweep. 1 = held in quarantine, 0 = in `blobs/` (or not
-- received yet). The findings themselves are in secret_findings.
ALTER TABLE upload_files ADD COLUMN quarantined INTEGER NOT NULL DEFAULT 0 CHECK (quarantined IN (0, 1));
