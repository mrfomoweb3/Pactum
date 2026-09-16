CREATE TABLE IF NOT EXISTS bonds (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  restaurant_name TEXT NOT NULL,
  payout_address TEXT NOT NULL,
  amount_luna INTEGER NOT NULL CHECK (amount_luna > 0),
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'PAYMENT_PENDING', 'SECURED')),
  payment_tx_hash TEXT UNIQUE,
  payer_address TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL REFERENCES bonds(id),
  payer_address TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  amount_luna INTEGER NOT NULL,
  data_reference TEXT NOT NULL,
  network_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bond_events (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL REFERENCES bonds(id),
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO bonds (
  id, public_id, restaurant_name, payout_address, amount_luna,
  status, created_at, updated_at
) VALUES (
  'bond_demo_casa_aurea', 'ca-8f47-aurea', 'Casa Aurea',
  'NQ77 8CXK 0PR4 7T9N LSBM L861 UVNU 2UKY D1U6', 1250000,
  'OPEN', datetime('now'), datetime('now')
);
