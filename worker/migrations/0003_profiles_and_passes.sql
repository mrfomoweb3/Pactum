CREATE TABLE IF NOT EXISTS wallet_nonces (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('GUEST', 'RESTAURANT')),
  message TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('GUEST', 'RESTAURANT')),
  display_name TEXT NOT NULL,
  restaurant_slug TEXT UNIQUE,
  timezone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE bonds ADD COLUMN holder_address TEXT;
ALTER TABLE bonds ADD COLUMN pass_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS pass_tokens (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL REFERENCES bonds(id),
  token_hash TEXT NOT NULL UNIQUE,
  short_code TEXT NOT NULL UNIQUE,
  pass_version INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_pass_tokens_token_hash ON pass_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_pass_tokens_short_code ON pass_tokens(short_code);
