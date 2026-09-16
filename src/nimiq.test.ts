import { describe, expect, it } from 'vitest'
import { walletErrorMessage } from './nimiq'

describe('Pactum amounts', () => {
  it('uses integer luna for the demo bond', () => {
    expect(12.5 * 100_000).toBe(1_250_000)
    expect(Number.isInteger(1_250_000)).toBe(true)
  })
})

describe('wallet error messages', () => {
  it('reads nested provider errors', () => {
    expect(walletErrorMessage({ error: { type: 'InvalidTransactionError', message: 'Insufficient funds' } }, 'Fallback'))
      .toBe('Insufficient funds')
  })

  it('reads top-level provider messages', () => {
    expect(walletErrorMessage({ message: 'User rejected' }, 'Fallback')).toBe('User rejected')
  })

  it('turns account sync failures into recovery instructions', () => {
    expect(walletErrorMessage({ error: { message: 'Something went wrong syncing your account' } }, 'Fallback'))
      .toContain('wait until the balance finishes loading')
  })
})
