import { describe, expect, it } from 'vitest'
import { secureRandom } from './secureRandom'

describe('secureRandom', () => {
  it('returns integers inside the inclusive range', () => {
    for (let index = 0; index < 100; index += 1) {
      const value = secureRandom(3, 7)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(3)
      expect(value).toBeLessThanOrEqual(7)
    }
  })

  it('returns the only value in a one-value range', () => {
    expect(secureRandom(4, 4)).toBe(4)
  })
})
