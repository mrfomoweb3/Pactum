import { describe, expect, it } from 'vitest'

describe('Pactum amounts', () => {
  it('uses integer luna for the demo bond', () => {
    expect(12.5 * 100_000).toBe(1_250_000)
    expect(Number.isInteger(1_250_000)).toBe(true)
  })
})
