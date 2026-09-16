UPDATE bonds
SET amount_luna = 1000,
    status = CASE WHEN payment_tx_hash IS NULL THEN 'OPEN' ELSE status END,
    updated_at = datetime('now')
WHERE public_id = 'ca-8f47-aurea'
  AND payment_tx_hash IS NULL;

DELETE FROM payment_intents
WHERE bond_id = 'bond_demo_casa_aurea'
  AND consumed_at IS NULL;
