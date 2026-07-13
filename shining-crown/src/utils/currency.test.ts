import { describe, expect, it } from 'vitest'

import {
  creditsToCurrency,
  currencyToCredits,
  formatCreditsDisplay,
  formatCurrency,
  formatCurrencyWithSpaces
} from './currency'
import { formatCurrency as formatCurrencyConfig } from '../config/currency'
import { BET_OPTIONS, DEFAULT_VALUES, getMaxBet, getMinBet, isValidBet } from '../config/gameConstants'

// All money amounts in code are integer deni; 100 deni = 1.00 MKD.
describe('currency formatting (deni in, denars out)', () => {
  it('formats deni as denars with 2 decimals', () => {
    expect(formatCurrency(521)).toBe('5.21 MKD')
    expect(formatCurrency(10000)).toBe('100.00 MKD')
    expect(formatCurrencyConfig(521)).toBe('5.21 MKD')
  })

  it('formats large amounts with thousand-space separators', () => {
    expect(formatCurrencyWithSpaces(1000050)).toBe('10 000.50 MKD')
  })
})

describe('credits conversion (denomination in denars per credit)', () => {
  it('converts deni to credits at the given denomination', () => {
    // 100.00 MKD at 0.01 MKD/credit = 10 000 credits
    expect(currencyToCredits(10000, 0.01)).toBe(10000)
    // 50.00 MKD at 1.00 MKD/credit = 50 credits
    expect(currencyToCredits(5000, 1.0)).toBe(50)
  })

  it('converts credits back to deni', () => {
    expect(creditsToCurrency(10000, 0.01)).toBe(10000)
    expect(creditsToCurrency(50, 1.0)).toBe(5000)
  })

  it('formats the credits display with spaces', () => {
    expect(formatCreditsDisplay(10000, 0.01)).toBe('10 000')
  })
})

describe('bet options are deni', () => {
  it('exposes the configured bets converted to deni', () => {
    expect(getMinBet()).toBe(500) // 5 MKD
    expect(getMaxBet()).toBe(100000) // 1000 MKD
    expect(BET_OPTIONS.every(Number.isInteger)).toBe(true)
    expect(DEFAULT_VALUES.BET).toBe(500)
  })

  it('validates bets against the deni list', () => {
    expect(isValidBet(500)).toBe(true)
    expect(isValidBet(5)).toBe(false)
    expect(isValidBet(501)).toBe(false)
  })
})
