import { describe, expect, it } from 'vitest'
import { verifyTransaction } from './index'

const intent = {
  id: 'intent_1234567890', bond_id: 'bond_1',
  payer_address: 'NQ02 31N6 3KM5 T6G5 22TN EPF5 5XPY RLHK RMB3',
  recipient_address: 'NQ77 8CXK 0PR4 7T9N LSBM L861 UVNU 2UKY D1U6',
  amount_luna: 1_000, data_reference: 'PACTUM:ca-8f47-aurea:v1',
  network_id: 24, expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null,
}

const transaction = {
  hash: 'a'.repeat(64), confirmations: 1,
  from: intent.payer_address, to: intent.recipient_address,
  value: intent.amount_luna, recipientData: intent.data_reference,
  networkId: 24, executionResult: true,
}

describe('Nimiq transaction verification', () => {
  it('accepts an exact matching payment', () => expect(verifyTransaction(transaction, intent)).toEqual([]))
  it('rejects mismatched recipient and amount', () => {
    expect(verifyTransaction({ ...transaction, to: 'NQ77 0000 0000 0000 0000 0000 0000 0000 0001', value: 1 }, intent))
      .toEqual(['wrong_recipient', 'wrong_amount'])
  })
})
