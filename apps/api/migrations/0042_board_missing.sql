-- Gap S5: when the hourly subscription run first found a known board missing (not listed, and its
-- own read answered exactly 404). Null while the board is listed. Two runs an hour apart confirm it.
ALTER TABLE source_boards ADD COLUMN missing_since TEXT;
