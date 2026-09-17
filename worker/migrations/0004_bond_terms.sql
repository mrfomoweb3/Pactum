ALTER TABLE bonds ADD COLUMN restaurant_profile_id TEXT REFERENCES profiles(id);
ALTER TABLE bonds ADD COLUMN reservation_at TEXT;
ALTER TABLE bonds ADD COLUMN restaurant_timezone TEXT;
ALTER TABLE bonds ADD COLUMN party_size INTEGER;
ALTER TABLE bonds ADD COLUMN policy_text TEXT;
ALTER TABLE bonds ADD COLUMN cancellation_deadline TEXT;
ALTER TABLE bonds ADD COLUMN external_reference TEXT;

CREATE INDEX IF NOT EXISTS idx_bonds_restaurant_profile ON bonds(restaurant_profile_id, reservation_at);
