import { describe, expect, it } from 'vitest'
import { bcdToNumber, numberToBcd } from './bcd'

describe('packed BCD (big-endian, per SAS)', () => {
  it('encodes numbers into n-byte packed BCD', () => {
    expect(numberToBcd(125000, 4)).toEqual(Buffer.from([0x00, 0x12, 0x50, 0x00]))
    expect(numberToBcd(0, 4)).toEqual(Buffer.from([0x00, 0x00, 0x00, 0x00]))
    expect(numberToBcd(99999999, 4)).toEqual(Buffer.from([0x99, 0x99, 0x99, 0x99]))
    expect(numberToBcd(12345, 5)).toEqual(Buffer.from([0x00, 0x00, 0x01, 0x23, 0x45]))
  })

  it('truncates to the least significant digits when the value overflows (SAS rollover)', () => {
    // 123456789 has 9 digits; a 4-byte meter keeps the low 8: 23456789
    expect(numberToBcd(123456789, 4)).toEqual(Buffer.from([0x23, 0x45, 0x67, 0x89]))
  })

  it('decodes packed BCD back to numbers', () => {
    expect(bcdToNumber(Buffer.from([0x00, 0x12, 0x50, 0x00]))).toBe(125000)
    expect(bcdToNumber(Buffer.from([0x99, 0x99, 0x99, 0x99]))).toBe(99999999)
    expect(bcdToNumber(Buffer.from([0x00, 0x00, 0x01, 0x23, 0x45]))).toBe(12345)
  })

  it('round-trips', () => {
    for (const value of [0, 1, 99, 100, 521, 66012100, 99999999]) {
      expect(bcdToNumber(numberToBcd(value, 5))).toBe(value)
    }
  })
})
