import { describe, expect, it } from 'vitest'
import { addressFromPublicKey, verifyTransaction } from './index'

const intent = {
  id: 'intent_1234567890', bond_id: 'bond_1',
  payer_address: 'NQ02 31N6 3KM5 T6G5 22TN EPF5 5XPY RLHK RMB3',
  recipient_address: 'NQ77 8CXK 0PR4 7T9N LSBM L861 UVNU 2UKY D1U6',
  amount_luna: 1_000, data_reference: 'PACTUM:ca-8f47-aurea:v1',
  network_id: 24, expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null,
  created_at: new Date().toISOString(),
}

const transaction = {
  hash: 'a'.repeat(64), timestamp: Date.now(), confirmations: 1,
  relatedAddresses: [intent.payer_address, intent.recipient_address],
  from: intent.payer_address, to: intent.recipient_address,
  value: intent.amount_luna, recipientData: intent.data_reference,
  networkId: 24, executionResult: true,
}

describe('Nimiq transaction verification', () => {
  it('derives the official Nimiq address from a public key', () => {
    expect(addressFromPublicKey('8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c'))
      .toBe('NQ32 QPH1 MCE9 XQ12 T0E3 N9F3 8DNB FUEY EYUN')
  })
  it('accepts an exact matching payment', () => expect(verifyTransaction(transaction, intent)).toEqual([]))
  it('rejects mismatched recipient and amount', () => {
    expect(verifyTransaction({ ...transaction, to: 'NQ77 0000 0000 0000 0000 0000 0000 0000 0001', value: 1 }, intent))
      .toEqual(['wrong_recipient', 'wrong_amount'])
  })

  it('accepts Nimiq Pay HTLC senders when the selected payer is related', () => {
    expect(verifyTransaction({
      ...transaction,
      from: 'NQ94 KKJN J36T 0938 HR9H NE1F PT70 J268 3E8Q',
    }, intent)).toEqual([])
  })

  it('rejects an unrelated sender', () => {
    expect(verifyTransaction({
      ...transaction,
      from: 'NQ94 KKJN J36T 0938 HR9H NE1F PT70 J268 3E8Q',
      relatedAddresses: ['NQ11 V6YH 5FNA R5UB Q7L6 VJV8 C08N FATC C4H2'],
      to: 'NQ77 0000 0000 0000 0000 0000 0000 0000 0001',
    }, { ...intent, recipient_address: 'NQ77 0000 0000 0000 0000 0000 0000 0000 0001' }))
      .toContain('wrong_sender')
  })
})
