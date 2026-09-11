-- Enforce tenant ownership on all new writes without deleting old history.
-- NOT VALID intentionally leaves pre-existing mismatches for operator review.
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_user_id_id ON devices (user_id, id);
ALTER TABLE progress_snapshots ADD CONSTRAINT progress_device_owner
  FOREIGN KEY (user_id, device_id) REFERENCES devices (user_id, id) NOT VALID;
ALTER TABLE reading_sessions ADD CONSTRAINT sessions_device_owner
  FOREIGN KEY (user_id, device_id) REFERENCES devices (user_id, id) NOT VALID;
