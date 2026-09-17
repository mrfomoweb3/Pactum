ALTER TABLE bonds ADD COLUMN service_status TEXT CHECK (service_status IN ('CHECKED_IN', 'APPLIED', 'REFUND_PENDING', 'REFUNDED'));
ALTER TABLE bonds ADD COLUMN refund_tx_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bonds_refund_tx_hash ON bonds(refund_tx_hash) WHERE refund_tx_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS transfer_nonces (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL REFERENCES bonds(id),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  pass_version INTEGER NOT NULL,
  message TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transfer_nonces_bond ON transfer_nonces(bond_id, expires_at);

CREATE TABLE IF NOT EXISTS refund_intents (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL REFERENCES bonds(id),
  sender_address TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  amount_luna INTEGER NOT NULL,
  data_reference TEXT NOT NULL,
  network_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
