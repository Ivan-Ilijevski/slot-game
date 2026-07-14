import { describe, expect, it } from 'vitest'
import { crc16Kermit } from './crc16'

describe('CRC-16/KERMIT', () => {
  it('matches the standard check value', () => {
    // Canonical CRC-16/KERMIT check: "123456789" -> 0x2189
    expect(crc16Kermit(Buffer.from('123456789', 'ascii'))).toBe(0x2189)
  })

  it('returns 0 for empty input', () => {
    expect(crc16Kermit(Buffer.alloc(0))).toBe(0x0000)
  })

  it('supports chaining via an initial value', () => {
    const whole = crc16Kermit(Buffer.from('123456789', 'ascii'))
    const first = crc16Kermit(Buffer.from('1234', 'ascii'))
    const chained = crc16Kermit(Buffer.from('56789', 'ascii'), first)
    expect(chained).toBe(whole)
  })
})
