ALTER TABLE bonds ADD COLUMN terminal_status TEXT CHECK (terminal_status IN ('CANCELLED', 'FORFEITED', 'EXPIRED'));

CREATE TABLE IF NOT EXISTS staff_members (
  id TEXT PRIMARY KEY,
  restaurant_profile_id TEXT NOT NULL REFERENCES profiles(id),
  wallet_address TEXT NOT NULL,
  can_refund INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(restaurant_profile_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_staff_wallet ON staff_members(wallet_address, revoked_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at TEXT NOT NULL
);
