CREATE TABLE IF NOT EXISTS room_overrides (
  room_id TEXT NOT NULL,
  status TEXT NOT NULL, -- FREE_EARLY, OCCUPIED_MAKEUP, SOCIETY_EVENT
  reported_by_section TEXT,
  note TEXT,
  verifications INT NOT NULL DEFAULT 1,
  slot_day INT NOT NULL,
  slot_index INT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, slot_day, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_room_overrides_expires ON room_overrides (expires_at);
